import { test, expect } from '@playwright/test';

// Sidebar structure is identical across breakpoints (same page tree);
// the only difference is presentation. Run these structural assertions
// on desktop only — mobile.spec.ts has its own drawer-specific test.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only structural test');
});

// Each docs page should appear exactly once in the sidebar nav. Pre-fix,
// `Quickstart` and `API Reference` were listed both as top-tab links and
// as regular nav entries. The fix removed the top tabs.
test('sidebar: each top-level entry appears at most once', async ({ page }) => {
  await page.goto('/docs/quickstart');
  await page.locator('aside, nav').first().waitFor();
  for (const label of ['Quickstart', 'API Reference', 'Authentication', 'Errors & retries']) {
    const matches = page.locator('aside a, nav a').filter({ hasText: new RegExp(`^${label}$`) });
    await expect(matches, `"${label}" must not be duplicated in the sidebar`).toHaveCount(1);
  }
});

// Guides used to overlap with API ref tag names (Messages, Webhooks).
// Renamed to verb-form so they don't visually collide.
test('sidebar: guide titles are verb-form (no Messages/Webhooks collision)', async ({ page }) => {
  await page.goto('/docs/quickstart');
  await page.locator('aside, nav').first().waitFor();
  await expect(page.locator('aside, nav').getByText('Sending messages')).toBeVisible();
  await expect(page.locator('aside, nav').getByText('Receiving webhooks')).toBeVisible();
  await expect(page.locator('aside, nav').getByText('Running campaigns')).toBeVisible();
  await expect(page.locator('aside, nav').getByText('Using the MCP server')).toBeVisible();
});
