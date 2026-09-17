import { existsSync } from 'node:fs';
import path from 'node:path';

const envFile = path.resolve(import.meta.dirname, '..', '..', '.env.local');
let loaded = false;

/** A setting from the environment, or from .env.local as the app reads it; what is already set wins. */
export function setting(key: string, where = 'See RUNBOOK 3.7a.'): string {
  if (!loaded) {
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    loaded = true;
  }
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is not set in .env.local. ${where}`);
  return value;
}
