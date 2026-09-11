#!/usr/bin/env node
// Runs the Supabase CLI with the root .env.local loaded, so supabase/config.toml env() values
// and the web app read the same file. Usage: pnpm supabase <command> [...args]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Empty placeholders keep config.toml valid when Google sign-in is not configured locally.
process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID ||= 'not-configured';
process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET ||= 'not-configured';

// Run the CLI's own launcher with Node directly: no shell, so paths with spaces work on Windows.
const launcher = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const result = spawnSync(process.execPath, [launcher, ...process.argv.slice(2)], { stdio: 'inherit', cwd: root });
process.exit(result.status ?? 1);
