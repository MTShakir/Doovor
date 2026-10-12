/** True for an address on this machine, where the local Supabase stack runs. */
export function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * Demo data never reaches production, and reaches a hosted project only when asked for, with
 * its own password (SEED_PASSWORD) so accounts on a public URL never use the documented one.
 * Every target is checked: the seed writes through both the Supabase API and the database.
 * Errors name the target, never its address, which can hold a password.
 */
export function assertSeedTargets(
  targets: readonly { label: string; url: string }[],
  options: { appEnv: string | undefined; allowRemote: boolean; customPassword: boolean },
): void {
  if (options.appEnv === 'production') throw new Error('Refusing to seed: APP_ENV is production.');
  const remote = targets.find(({ url }) => !isLocalUrl(url));
  if (!remote) return;
  const local = targets.find(({ url }) => isLocalUrl(url));
  if (local) {
    throw new Error(`Refusing to seed: the ${local.label} is local but the ${remote.label} is not. Point every target at one project.`);
  }
  if (!options.allowRemote) {
    throw new Error(`Refusing to seed: the ${remote.label} is not local. Pass --allow-remote for a staging project.`);
  }
  if (!options.customPassword) {
    throw new Error('Refusing to seed a hosted project without SEED_PASSWORD: its demo accounts must not use the documented password.');
  }
}

export type DatabaseUrl = { ok: true; url: string; note?: string } | { ok: false; problem: string };

/** Undoes percent-encoding where there is some, and leaves a value alone where there is none. */
function decoded(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A database connection string as somebody pastes it from Supabase, made safe to connect with.
 *
 * Supabase's Connect panel shows the string with `[YOUR-PASSWORD]` where the password goes, and
 * people put theirs there as it is. A password with `#`, `/` or `?` in it then breaks the string,
 * because each of those ends the part of an address that holds the password, and every URL parser
 * says "Invalid URL" without saying which value or why (the launch wipe did exactly that on 12
 * October 2026). So the string is read by its shape instead: the password is everything between
 * the first `:` after the user and the last `@` before the host, whatever is in it, and the string
 * is put back together with the user and password encoded properly. A password that was already
 * encoded comes out the same, because it is decoded first.
 *
 * What is wrong is said in words and the value is never repeated, because it holds a password.
 */
export function databaseUrlFrom(raw: string): DatabaseUrl {
  const value = raw.trim();
  if (value === '') return { ok: false, problem: 'SUPABASE_DB_URL is empty.' };

  const scheme = /^(postgres(?:ql)?:\/\/)/i.exec(value)?.[1];
  if (scheme === undefined) {
    return {
      ok: false,
      problem:
        'SUPABASE_DB_URL is not a database connection string. It should start with postgresql://, the way Supabase shows it under Connect, Session pooler.',
    };
  }
  if (/YOUR-PASSWORD/i.test(value)) {
    return {
      ok: false,
      problem: 'SUPABASE_DB_URL still has [YOUR-PASSWORD] in it. Put your database password in its place, without the square brackets.',
    };
  }

  const rest = value.slice(scheme.length);
  const at = rest.lastIndexOf('@');
  if (at === -1) {
    return { ok: false, problem: 'SUPABASE_DB_URL has no user and password in it: there is no @ before the address.' };
  }
  const userinfo = rest.slice(0, at);
  const address = rest.slice(at + 1);
  const colon = userinfo.indexOf(':');
  if (colon === -1) {
    return { ok: false, problem: 'SUPABASE_DB_URL has a user but no password: there is no : between them.' };
  }

  const user = userinfo.slice(0, colon);
  let password = userinfo.slice(colon + 1);
  let note: string | undefined;
  // Typed inside the brackets the placeholder came in, which are not part of the password.
  if (password.length > 2 && password.startsWith('[') && password.endsWith(']')) {
    password = password.slice(1, -1);
    note = 'Took the square brackets off the database password: Supabase puts them round where the password goes.';
  }
  if (user === '' || password === '') {
    return { ok: false, problem: 'SUPABASE_DB_URL is missing its user or its password.' };
  }

  const url = `${scheme}${encodeURIComponent(decoded(user))}:${encodeURIComponent(decoded(password))}@${address}`;
  try {
    if (new URL(url).hostname === '') throw new Error('no host');
  } catch {
    return {
      ok: false,
      problem: 'SUPABASE_DB_URL has an address after the @ that is not one. Copy it again from Supabase, Connect, Session pooler.',
    };
  }
  return note === undefined ? { ok: true, url } : { ok: true, url, note };
}
