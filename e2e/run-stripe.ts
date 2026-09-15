import { spawnSync } from 'node:child_process';

/**
 * The Stripe test-mode run (RUNBOOK 3.7a, M3-23): the specs in specs/stripe, against the app
 * running with Stripe, `pnpm stripe:listen` and `pnpm dev:jobs`. Every other run stays on the fake,
 * so these specs only run from here. Extra arguments go to Playwright.
 */
const extra = process.argv.slice(2).map((argument) => JSON.stringify(argument));
const result = spawnSync(['pnpm exec playwright test --project=stripe', ...extra].join(' '), {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_PAYMENTS: 'stripe' },
});
process.exit(result.status ?? 1);
