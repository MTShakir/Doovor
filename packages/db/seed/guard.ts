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
 * Demo data never reaches production, and reaches a hosted project only when asked for.
 * Every target is checked: the seed writes through both the Supabase API and the database.
 * Errors name the target, never its address, which can hold a password.
 */
export function assertSeedTargets(
  targets: readonly { label: string; url: string }[],
  options: { appEnv: string | undefined; allowRemote: boolean },
): void {
  if (options.appEnv === 'production') throw new Error('Refusing to seed: APP_ENV is production.');
  if (options.allowRemote) return;
  for (const { label, url } of targets) {
    if (!isLocalUrl(url)) {
      throw new Error(`Refusing to seed: the ${label} is not local. Pass --allow-remote for a staging project.`);
    }
  }
}
