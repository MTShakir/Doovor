#!/usr/bin/env node
// Runs the pgTAP suite again with the local database reading its clock in a time zone whose date
// is not the UK's (D-156). The product's today is the UK's (`private.today()`, M6-06a). A test
// that takes its today from the session instead passes for 23 hours a day and fails in the hour
// after midnight in the UK, as one did in CI on 18 September. Run on another day every time, it
// fails every time.
// Usage: pnpm db:test:another-day (the local stack must be running)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8'))?.[1];
const container = `supabase_db_${projectId ?? ''}`;

const dayIn = (timeZone) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const uk = dayIn('Europe/London');
// Twelve hours behind UTC and fourteen ahead: at any moment one of the two is on another day.
const zone = ['Etc/GMT+12', 'Pacific/Kiritimati'].find((candidate) => dayIn(candidate) !== uk) ?? 'Etc/GMT+12';

function psql(sql) {
  const run = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`${container}: ${run.stderr || `psql exited ${String(run.status)}`}`);
  return run.stdout.trim();
}

psql(`alter database postgres set timezone to '${zone}'`);
let status = 1;
try {
  console.log(`pgTAP with the database on ${dayIn(zone)} (${zone}) while the UK is on ${uk}.`);
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'supabase.mjs'), 'test', 'db'], { stdio: 'inherit', cwd: root });
  status = run.status ?? 1;
} finally {
  psql('alter database postgres reset timezone');
}
process.exit(status);
