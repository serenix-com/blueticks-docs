import { test, expect } from '@playwright/test';

// On mobile the theme toggle lives behind the sidebar drawer; the
// drawer-open + click flow is brittle to test. Run on desktop only —
// the toggle implementation is project-agnostic.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop-only — mobile lives behind drawer');
});

test('theme toggle flips html.dark class', async ({ page }) => {
  await page.goto('/docs/quickstart');
  // Fumadocs renders the theme toggle inside the sidebar footer. Click
  // the moon variant to force dark; click the sun variant to revert.
  const html = page.locator('html');
  const initiallyDark = (await html.getAttribute('class'))?.includes('dark');

  // Click whichever toggle is currently unselected.
  const toggle = page.getByRole('button', { name: /Toggle Theme|Switch to (dark|light)/i }).first();
  await toggle.click();

  // Theme switch is applied via class on <html>. Wait for it to flip.
  if (initiallyDark) {
    await expect.poll(async () => (await html.getAttribute('class')) ?? '').not.toContain('dark');
  } else {
    await expect.poll(async () => (await html.getAttribute('class')) ?? '').toContain('dark');
  }
});
