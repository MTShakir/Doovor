#!/usr/bin/env node
// Encrypted backups of the hosted database while it is on Supabase's free plan, which keeps none
// (NFR-SEC-07, D-161). See docs/RUNBOOK.md, "Backups and going back".
//
//   pnpm db:backup                 dump the hosted project, seal it, and keep five weeks of them
//   pnpm db:backup --local         the same from the local stack, to try it out
//   pnpm db:backup:open <file>     write the three SQL files out again, to restore from
//
// Needs Docker running (the Supabase CLI dumps with pg_dump in a container), and BACKUP_PASSPHRASE
// in .env.local. Nothing is ever written unencrypted except by `open`, which says so.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const backup = await import(pathToFileURL(path.join(root, 'packages', 'db', 'src', 'backup.ts')).href);
const { brand } = await import(pathToFileURL(path.join(root, 'packages', 'config', 'src', 'brand.ts')).href);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Where backups go: BACKUP_DIR, or a folder in the home folder. Never inside the repository. */
function backupDir() {
  const dir = path.resolve(process.env.BACKUP_DIR || path.join(os.homedir(), `${brand.name} backups`));
  const inside = path.relative(root, dir);
  if (!inside.startsWith('..') && !path.isAbsolute(inside)) fail(`Refusing to keep backups inside the repository (${dir}). Set BACKUP_DIR to a folder outside it.`);
  return dir;
}

/** One `supabase db dump`, through the wrapper that loads .env.local, into a file. */
function dump(target, file, flags) {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'supabase.mjs'), 'db', 'dump', target, '-f', file, ...flags], {
    cwd: root,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (run.status !== 0) fail(`The dump stopped (${path.basename(file)}). Is Docker running, and is SUPABASE_ACCESS_TOKEN set in .env.local?`);
}

function make(local) {
  const passphrase = backup.checkPassphrase(process.env.BACKUP_PASSPHRASE);
  const dir = backupDir();
  const now = new Date();
  // The plain dumps live only in a temporary folder, removed however this ends.
  const work = mkdtempSync(path.join(os.tmpdir(), 'db-backup-'));
  try {
    const target = local ? '--local' : '--linked';
    dump(target, path.join(work, 'roles.sql'), ['--role-only']);
    dump(target, path.join(work, 'schema.sql'), []);
    dump(target, path.join(work, 'data.sql'), ['--data-only', '--use-copy', ...backup.notOurData.flatMap((table) => ['-x', table])]);
    const files = Object.fromEntries(backup.backupParts.map((part) => [part, readFileSync(path.join(work, part), 'utf8')]));
    files['roles.sql'] = backup.restorableRoles(files['roles.sql']);
    const sealed = backup.sealBackup(files, passphrase, { createdAt: now, source: local ? 'local' : 'hosted' });
    mkdirSync(dir, { recursive: true });
    const out = path.join(dir, backup.backupName(now));
    writeFileSync(out, sealed, { mode: 0o600 });
    const removed = backup.backupsToRemove(readdirSync(dir), now);
    for (const name of removed) rmSync(path.join(dir, name));
    const kilobytes = Math.round(statSync(out).size / 1024);
    process.stdout.write(
      [
        `Backup written: ${out} (${String(kilobytes)} KB, encrypted).`,
        removed.length > 0 ? `Removed ${String(removed.length)} older than five weeks.` : 'Nothing older than five weeks to remove.',
        'Pictures people upload stay in Supabase Storage and are not in the backup.',
        '',
      ].join('\n'),
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function open(file, into) {
  if (!file || !existsSync(file)) fail('Usage: pnpm db:backup:open <backup file> [folder to write into]');
  const passphrase = backup.checkPassphrase(process.env.BACKUP_PASSPHRASE);
  const opened = backup.openBackup(readFileSync(file, 'utf8'), passphrase);
  const folder = path.resolve(into || file.replace(/\.backup$/, ''));
  mkdirSync(folder, { recursive: true });
  for (const part of backup.backupParts) writeFileSync(path.join(folder, part), opened.files[part], { mode: 0o600 });
  process.stdout.write(
    [
      `Opened a backup of the ${opened.source} database made ${opened.createdAt}.`,
      `Written to ${folder}: ${backup.backupParts.join(', ')}.`,
      'These files are NOT encrypted and hold everybody\'s personal data. Delete the folder as soon as the restore is done.',
      'To restore into an empty project, see docs/RUNBOOK.md, "Backups and going back".',
      '',
    ].join('\n'),
  );
}

try {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'open') open(rest[0], rest[1]);
  else make(process.argv.includes('--local'));
} catch (error) {
  if (error instanceof backup.BackupError) fail(error.message);
  throw error;
}
