import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { answeredCookies, AUTH_DIR, cookieAnswer } from './support/accounts';

/**
 * Every run starts from the same data: reset the local database and seed it (M0-28), and from a
 * browser that has already answered the cookie question, which is how most visitors arrive (M6-08).
 * Set E2E_SKIP_RESET=1 to reuse the current database while iterating locally.
 */
export default function globalSetup(): void {
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(
    answeredCookies,
    JSON.stringify({
      cookies: [],
      origins: [{ origin: process.env.E2E_BASE_URL ?? 'http://localhost:3000', localStorage: [cookieAnswer] }],
    }),
  );

  if (process.env.E2E_SKIP_RESET === '1') return;
  const root = path.resolve(import.meta.dirname, '..');
  execSync('pnpm db:reset', { cwd: root, stdio: 'inherit' });
}
