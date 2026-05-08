import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

// Two breakpoints: desktop (the surface most users hit) and mobile
// (everything narrower than the Fumadocs sidebar collapse point).
// Functional assertions run on both. Visual screenshots are saved to
// `tests/screenshots/<browser>/<page>.png` for human review — no diff
// comparison, since we don't have a golden baseline yet.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Sequential reporter keeps the per-page artifact list scannable.
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Mobile project pins to chromium (with the iPhone-14 viewport +
      // user agent). The webkit engine that `devices['iPhone 14']`
      // would otherwise pull in isn't downloaded by the lean
      // `playwright install chromium` step we run in CI.
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        browserName: 'chromium',
      },
    },
  ],
  // Bring up the Next dev server if it isn't already running. Reuse an
  // existing one if PORT is taken (e.g. when running tests against an
  // already-warm dev session).
  webServer: {
    command: `PORT=${PORT} pnpm dev`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
