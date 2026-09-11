#!/usr/bin/env node
// Runs the Supabase CLI with the root .env.local loaded, so supabase/config.toml env() values
// and the web app read the same file. Usage: pnpm supabase <command> [...args]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Empty placeholders keep config.toml valid when Google sign-in is not configured locally.
process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID ||= 'not-configured';
process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET ||= 'not-configured';

// The hosted config (config.toml [remotes.*]) takes its brand values from brand.ts, so the
// name, domain and sender addresses stay in one file (rule 8). Never name these
// SUPABASE_AUTH_*: the CLI forwards that prefix into the local auth container, which would
// point local sign-in emails at the production domain and break the email tests.
const { brand } = await import(pathToFileURL(path.join(root, 'packages', 'config', 'src', 'brand.ts')).href);
process.env.BRAND_SITE_URL ||= brand.productionUrl;
process.env.BRAND_REDIRECT_URL ||= `${brand.productionUrl}/**`;
process.env.BRAND_SENDER_EMAIL ||= brand.email.fromAddress;
process.env.BRAND_SENDER_NAME ||= brand.name;

// Ofcom drama numbers with a fixed code, for local and CI phone tests (D-033). The CLI
// forwards SUPABASE_AUTH_* into the local auth container, so these never reach a hosted
// project the way a config.toml entry would.
process.env.SUPABASE_AUTH_SMS_TEST_OTP ||= Array.from({ length: 9 }, (_, i) => `44770090000${i + 1}:123456`).join(',');

// A hosted push writes every value the config declares, so a secret that is not set would be
// stored as the literal "env(NAME)" or as an empty password. Refuse before that happens.
const argv = process.argv.slice(2);
if (argv.includes('config') && argv.includes('push')) {
  // Only the secrets the hosted config actually uses. Add the Twilio and Google names here
  // when those providers are switched on in ops/staging/supabase/config.toml.
  const needed = ['RESEND_API_KEY'];
  const missing = needed.filter((name) => {
    const value = process.env[name];
    return !value || value === 'not-configured';
  });
  if (missing.length > 0) {
    const newline = String.fromCharCode(10);
    process.stderr.write(
      [
        `Refusing to push hosted settings. Not set in .env.local: ${missing.join(', ')}.`,
        'The push would store placeholder text or an empty password in the project.',
        'See docs/RUNBOOK.md section 3.1.',
        '',
      ].join(newline),
    );
    process.exit(1);
  }
}

// Run the CLI's own launcher with Node directly: no shell, so paths with spaces work on Windows.
const launcher = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const result = spawnSync(process.execPath, [launcher, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
process.exit(result.status ?? 1);
