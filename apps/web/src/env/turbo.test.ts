import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clientEnvSchema, serverEnvSchema } from './schema';

/**
 * Turbo hands the build only the variables turbo.json names and drops the rest without a word.
 * A key the guard checks but Turbo drops reads as missing while the pages are built, so
 * production refuses to build although Vercel holds the value. SUPABASE_SEND_SMS_HOOK_SECRET did
 * exactly that the day APP_ENV became production (D-248).
 */
const turbo = JSON.parse(readFileSync(new URL('../../../../turbo.json', import.meta.url), 'utf8')) as {
  globalEnv?: string[];
  globalPassThroughEnv?: string[];
};
const patterns = [...(turbo.globalEnv ?? []), ...(turbo.globalPassThroughEnv ?? [])];

function reachesTheBuild(key: string): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? key.startsWith(pattern.slice(0, -1)) : key === pattern,
  );
}

describe('turbo.json', () => {
  it('passes every key the environment guard reads through to the build (D-248)', () => {
    const keys = [...Object.keys(serverEnvSchema.out.shape), ...Object.keys(clientEnvSchema.out.shape)];
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((key) => !reachesTheBuild(key))).toEqual([]);
  });
});
