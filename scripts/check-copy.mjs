#!/usr/bin/env node
// Copy guard for CI and `pnpm lint`: brand values only in brand.ts, no em or en dashes.
// Scans tracked and new (not ignored) files so violations are caught before commit.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { findViolations, formatViolation, isInScope } from '../packages/config/src/copy-guard.ts';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .map((f) => f.trim())
  .filter((f) => f && isInScope(f) && existsSync(f));

const violations = files.flatMap((file) => findViolations(file, readFileSync(file, 'utf8')));

if (violations.length > 0) {
  console.error(`Copy guard failed with ${violations.length} problem(s):`);
  for (const v of violations) console.error(`  ${formatViolation(v)}`);
  process.exit(1);
}
console.log(`Copy guard passed (${files.length} files checked).`);
