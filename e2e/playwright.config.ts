import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * Every flow runs at 390 px (touch phone) and 1440 px (desktop), as the brief requires.
 * Retries stay at zero: a flaky test is a bug to fix, not to hide.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: isCI ? 'pnpm --filter @repo/web start' : 'pnpm --filter @repo/web dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    cwd: '..',
  },
});
