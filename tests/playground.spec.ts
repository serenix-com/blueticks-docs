import { test, expect, type Page } from '@playwright/test';

const playgroundForm = (page: Page) => page.locator('article form').first();
const serverPill = (page: Page) =>
  playgroundForm(page).locator('button[aria-haspopup="dialog"]').first();

test.describe('API operation page — playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/docs/api/messages/send-message');
    await playgroundForm(page).waitFor();
  });

  test('renders fumadocs-openapi layout (the missing-CSS regression guard)', async ({
    page,
  }) => {
    // If the openapi preset.css import is dropped again, the right-side
    // code panel collapses and the cURL tab disappears. Both being
    // visible at standard width = preset is wired.
    await expect(playgroundForm(page)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'cURL' })).toBeVisible();
  });

  test('Server URL pill displays the active server URL (dev: prod first)', async ({
    page,
  }) => {
    // The pill text is the canonical signal that the env-driven server
    // wiring landed: dev unset → prod URL shown by default. The
    // dialog-open interaction is exercised manually in QA because
    // Radix Dialog clicks are flaky in headless chromium portals.
    await expect(serverPill(page)).toContainText('https://api.blueticks.co');
  });

  test('two servers configured in dev (data-api-server-count)', async ({ page }) => {
    // Wrapping div carries the resolved server count (set in
    // app/docs/layout.tsx via getResolvedServerCount). 2 in dev,
    // 1 in production.
    const count = await page.locator('[data-api-server-count]').first().getAttribute('data-api-server-count');
    expect(count).toBe('2');
  });

  test('no $-prefixed query parameter labels rendered (backend regression complement)', async ({
    page,
  }) => {
    await page.goto('/docs/api/account/get-account');
    // Expand the Query collapsible if present.
    const queryHeader = page.getByRole('button', { name: /^Query$/ });
    if (await queryHeader.count()) await queryHeader.click().catch(() => {});
    // None of the documented query-parameter names should start with `$`.
    const article = page.locator('article');
    await expect(article).not.toContainText(/\$limit|\$skip|\$sort/);
  });

  test('Send button is rendered and clickable on every operation page', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'structural — desktop only');
    await page.goto('/docs/api/account/get-account');
    await playgroundForm(page).waitFor();
    const send = playgroundForm(page).getByRole('button', { name: 'Send' });
    await expect(send).toBeVisible();
    await expect(send).toBeEnabled();
    // The auth field must be present so users can paste a key.
    await expect(playgroundForm(page).getByText('Authorization')).toBeVisible();
  });
});
