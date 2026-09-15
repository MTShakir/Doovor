#!/usr/bin/env node
// Writes .env.local from .env.example plus the keys of the running local Supabase stack.
// Usage: pnpm db:env [--force] (CI: node scripts/local-env.mjs --app-env=test)
// CI runs it after `pnpm db:start`; locally it saves copying keys by hand.
import { execFileSync } from 'node:child_process';
import { createECDH } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, '.env.local');
const args = process.argv.slice(2);

if (existsSync(target) && !args.includes('--force')) {
  console.error('.env.local already exists. Pass --force to replace it.');
  process.exit(1);
}
const appEnv = args.find((arg) => arg.startsWith('--app-env='))?.slice('--app-env='.length) ?? 'local';

const status = execFileSync(process.execPath, [path.join(root, 'scripts', 'supabase.mjs'), 'status', '-o', 'env'], {
  cwd: root,
  encoding: 'utf8',
});
const stack = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => [match[1], match[2]]),
);
for (const key of ['API_URL', 'PUBLISHABLE_KEY', 'SECRET_KEY']) {
  if (!stack[key]) {
    console.error(`supabase status did not report ${key}. Start the stack first with pnpm db:start.`);
    process.exit(1);
  }
}

// A web push key pair of its own for this checkout (NTF-01). It only identifies this copy of the
// app to push services, so a fresh one per machine is right, and without one the settings
// screen says push is not set up and nothing about push can be tried. Same shape web-push makes:
// an uncompressed P-256 public key and its private scalar, both base64url.
const vapid = createECDH('prime256v1');
vapid.generateKeys();

const values = {
  APP_ENV: appEnv,
  NEXT_PUBLIC_SUPABASE_URL: stack.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: stack.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: stack.SECRET_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.getPublicKey('base64url'),
  VAPID_PRIVATE_KEY: vapid.getPrivateKey('base64url'),
};
const lines = readFileSync(path.join(root, '.env.example'), 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
    return key && key in values ? `${key}=${values[key]}` : line;
  });
writeFileSync(target, lines.join('\n'));
console.log(`Wrote .env.local for the local Supabase stack (APP_ENV=${appEnv}).`);
