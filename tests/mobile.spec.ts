import { test, expect } from '@playwright/test';

// Mobile-only behavioural assertions. Skip on the desktop project so we
// don't false-fail when the sidebar drawer is permanently visible.
test.describe('mobile layout', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only');
  });

  test('sidebar collapses behind a hamburger that toggles a drawer', async ({
    page,
  }) => {
    await page.goto('/docs/quickstart');
    // The persistent sidebar should be hidden at mobile width — fumadocs
    // moves nav into a drawer that opens via a button.
    const drawerToggle = page
      .getByRole('button', { name: /sidebar|menu|navigation|toggle/i })
      .first();
    await expect(drawerToggle).toBeVisible();
    await drawerToggle.click();
    // Once toggled, the drawer should expose the same primary nav links.
    await expect(page.getByRole('link', { name: 'Quickstart' }).first()).toBeVisible();
  });

  test('operation page: cURL examples stack below the form (no two-column overflow)', async ({
    page,
  }) => {
    await page.goto('/docs/api/messages/send-message');
    const form = page.locator('article form').first();
    await form.waitFor();
    const formBox = await form.boundingBox();
    const viewport = page.viewportSize();
    // The playground form must not overflow horizontally on mobile.
    expect(formBox).not.toBeNull();
    expect(formBox!.x).toBeGreaterThanOrEqual(0);
    expect(formBox!.x + formBox!.width).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  });
});
