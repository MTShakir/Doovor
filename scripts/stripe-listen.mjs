#!/usr/bin/env node
// Forwards Stripe events for connected accounts to the local webhook (RUNBOOK 3.7, 3.7a).
// Usage: pnpm stripe:listen
//
// It listens as the account whose test key is in .env.local, so the events it forwards are the
// ones the app's own payments raise, whatever account `stripe login` last signed in to. It keeps
// the listener's signing secret in STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET, and
// never prints it. Test mode only: it refuses a live key.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env.local');
if (!existsSync(envFile)) {
  console.error('No .env.local at the repository root. Run pnpm db:env first.');
  process.exit(1);
}

const text = readFileSync(envFile, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const lines = text.split(/\r?\n/);
const valueOf = (key) => lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? '';

const key = valueOf('STRIPE_SECRET_KEY');
if (!key.startsWith('sk_test_')) {
  console.error('STRIPE_SECRET_KEY in .env.local is not a test mode key. The local listener only ever runs in test mode.');
  process.exit(1);
}

const env = { ...process.env, STRIPE_API_KEY: key };
const hide = (output) => output.replace(/whsec_[A-Za-z0-9]+/g, 'whsec_(kept in .env.local)');

const printed = spawnSync('stripe', ['listen', '--print-secret'], { env, encoding: 'utf8' });
const secret = /whsec_[A-Za-z0-9]+/.exec(`${printed.stdout ?? ''}${printed.stderr ?? ''}`)?.[0];
if (!secret) {
  console.error(hide(`The Stripe CLI gave no signing secret. Is it installed? ${printed.stderr ?? ''}`));
  process.exit(1);
}

let changed = false;
for (const name of ['STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET']) {
  const index = lines.findIndex((line) => line.startsWith(`${name}=`));
  if (index === -1) {
    const at = lines.at(-1) === '' ? lines.length - 1 : lines.length;
    lines.splice(at, 0, `${name}=${secret}`);
    changed = true;
  } else if (lines[index] !== `${name}=${secret}`) {
    lines[index] = `${name}=${secret}`;
    changed = true;
  }
}
if (changed) {
  writeFileSync(envFile, lines.join(eol));
  console.warn('Kept the listener signing secret in .env.local. Restart the app if it is running: it reads .env.local when it starts.');
}

const listener = spawn('stripe', ['listen', '--forward-connect-to', 'localhost:3000/api/webhooks/stripe'], { env });
listener.stdout.on('data', (chunk) => process.stdout.write(hide(String(chunk))));
listener.stderr.on('data', (chunk) => process.stderr.write(hide(String(chunk))));
listener.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => listener.kill(signal));
