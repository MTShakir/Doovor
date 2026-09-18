import { defineConfig } from '@playwright/test';
import { answeredCookies } from './support/accounts';

const isCI = Boolean(process.env.CI);
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** The Stripe test-mode run (`pnpm test:e2e:stripe`, RUNBOOK 3.7a): its specs run only when asked for. */
const stripeRun = process.env.E2E_PAYMENTS === 'stripe';
const stripeSpecs = /[\\/]specs[\\/]stripe[\\/]/;

/**
 * Every flow runs at 390 px (touch phone) and 1440 px (desktop), as the brief requires.
 * Retries stay at zero: a flaky test is a bug to fix, not to hide.
 * A flow that exists on one form factor only is tagged @phone-only or @desktop-only and left out
 * of the other project, rather than skipped at run time.
 */
export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  workers: isCI ? 2 : 4,
  timeout: 60_000,
  // The dev server compiles a route the first time it is asked for, which can take longer
  // than the five second default for the navigation that follows. CI runs against a build.
  expect: { timeout: isCI ? 5_000 : 15_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Already answered, the way most visitors arrive. The spec about the question itself opens a
    // browser of its own that has not (M6-08).
    storageState: answeredCookies,
  },
  projects: [
    {
      // Serial: on a cold dev server, parallel first requests race Turbopack's on-demand compile.
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      fullyParallel: false,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, stripeSpecs],
      grepInvert: /@desktop-only/,
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
      dependencies: ['setup'],
      testIgnore: [/.*\.setup\.ts/, stripeSpecs],
      grepInvert: /@phone-only/,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    ...(stripeRun
      ? [
          {
            // Against Stripe test mode, one test at a time; a test opens a phone of its own where it needs one.
            name: 'stripe',
            dependencies: ['setup'],
            testMatch: stripeSpecs,
            fullyParallel: false,
            use: { browserName: 'chromium' as const, viewport: { width: 1440, height: 900 } },
          },
        ]
      : []),
  ],
  webServer: {
    command: isCI ? 'pnpm --filter @repo/web start' : 'pnpm --filter @repo/web dev',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    cwd: '..',
  },
});
