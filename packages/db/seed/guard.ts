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
