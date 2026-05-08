import { test } from '@playwright/test';

// Page-by-page visual snapshot capture. No diff comparison — each run
// overwrites the previous artifact under `tests/screenshots/<project>/`.
// Reviewers eyeball the produced PNGs as part of PR review. Pages
// chosen to cover every layout shape: hand-written, OpenAPI list,
// OpenAPI singleton, OpenAPI create-with-body, OpenAPI nested-resource.

const PAGES = [
  { name: 'home', url: '/' },
  { name: 'docs-introduction', url: '/docs' },
  { name: 'docs-quickstart', url: '/docs/quickstart' },
  { name: 'docs-authentication', url: '/docs/authentication' },
  { name: 'docs-errors', url: '/docs/errors' },
  { name: 'docs-sending-messages', url: '/docs/messages' },
  { name: 'docs-receiving-webhooks', url: '/docs/webhooks' },
  { name: 'docs-running-campaigns', url: '/docs/campaigns' },
  { name: 'docs-using-mcp', url: '/docs/mcp' },
  { name: 'docs-changelog', url: '/docs/changelog' },
  { name: 'api-index', url: '/docs/api' },
  { name: 'api-get-account', url: '/docs/api/account/get-account' },
  { name: 'api-list-messages', url: '/docs/api/messages/list-messages' },
  { name: 'api-send-message', url: '/docs/api/messages/send-message' },
  { name: 'api-create-webhook', url: '/docs/api/webhooks/create-webhook' },
  { name: 'api-create-campaign', url: '/docs/api/campaigns/create-campaign' },
];

for (const { name, url } of PAGES) {
  test(`visual: ${name}`, async ({ page }, testInfo) => {
    await page.goto(url);
    // Let async-rendered playground / OpenAPI panels settle.
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({
      path: `tests/screenshots/${testInfo.project.name}/${name}.png`,
      fullPage: true,
    });
  });
}
