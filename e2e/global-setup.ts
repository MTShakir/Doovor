import { execSync } from 'node:child_process';
import path from 'node:path';

/**
 * Every run starts from the same data: reset the local database and seed it (M0-28).
 * Set E2E_SKIP_RESET=1 to reuse the current database while iterating locally.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_RESET === '1') return;
  const root = path.resolve(import.meta.dirname, '..');
  execSync('pnpm db:reset', { cwd: root, stdio: 'inherit' });
}
