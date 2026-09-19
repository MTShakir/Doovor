// The local stack, as the load scripts reach it (M6-05): the same API the app uses, with the
// publishable key or a person's own token. Nothing here uses the secret key, and nothing runs
// anywhere but the local stack: a load test pointed at a hosted project would be an attack on it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');

const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const appUrl = process.env.LOAD_APP_URL ?? 'http://localhost:3000';

if (!supabaseUrl || !publishableKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. Run pnpm db:env.');
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(supabaseUrl)) {
  console.error('The load tests only ever run against the local stack.');
  process.exit(1);
}

/** The password the seed gave every account it made (pnpm db:seed). */
export function seedPassword() {
  const file = path.join(root, 'e2e', '.auth', 'seed-accounts.json');
  if (!existsSync(file)) {
    console.error(`No ${file}. Run pnpm db:seed first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, 'utf8')).password;
}

export async function ask(url, options = {}, token) {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: publishableKey,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${url} answered ${String(response.status)}: ${body.slice(0, 300)}`);
  return body === '' ? null : JSON.parse(body);
}

export const rpc = (name, body, token) => ask(`${supabaseUrl}/rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, token);

export const rest = (query, token) => ask(`${supabaseUrl}/rest/v1/${query}`, {}, token);

/** A token lasts an hour, so every script signs in for itself rather than reusing a saved one. */
export async function signIn(email, password) {
  const session = await ask(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return { token: session.access_token, id: session.user.id };
}
