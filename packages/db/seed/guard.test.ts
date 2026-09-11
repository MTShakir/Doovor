import { describe, expect, it } from 'vitest';
import { assertSeedTargets, isLocalUrl } from './guard';

const localTargets = [
  { label: 'Supabase URL', url: 'http://127.0.0.1:54321' },
  { label: 'database URL', url: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' },
];
const hostedTargets = [
  { label: 'Supabase URL', url: 'https://abcdefghijklmnop.supabase.co' },
  { label: 'database URL', url: 'postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres' },
];

describe('seed guard (M0-28)', () => {
  it('recognises the local stack', () => {
    expect(isLocalUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalUrl('http://localhost:54321')).toBe(true);
    expect(isLocalUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(true);
  });

  it('treats hosted and malformed addresses as remote', () => {
    expect(isLocalUrl('https://abcdefghijklmnop.supabase.co')).toBe(false);
    expect(isLocalUrl('postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres')).toBe(false);
    expect(isLocalUrl('http://localhost.example.com')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });

  it('seeds local targets', () => {
    expect(() => { assertSeedTargets(localTargets, { appEnv: 'local', allowRemote: false, customPassword: false }); }).not.toThrow();
  });

  it('refuses a hosted project unless asked', () => {
    expect(() => { assertSeedTargets(hostedTargets, { appEnv: 'preview', allowRemote: false, customPassword: true }); }).toThrow(
      /Supabase URL is not local/,
    );
  });

  it('seeds a hosted project when asked, but only with its own password', () => {
    expect(() => { assertSeedTargets(hostedTargets, { appEnv: 'preview', allowRemote: true, customPassword: true }); }).not.toThrow();
    // Demo accounts on a public URL must not use the documented password.
    expect(() => { assertSeedTargets(hostedTargets, { appEnv: 'preview', allowRemote: true, customPassword: false }); }).toThrow(
      /SEED_PASSWORD/,
    );
  });

  it('refuses a mix of local and hosted targets', () => {
    const mixed = [localTargets[0], hostedTargets[1]].filter((target) => target !== undefined);
    // Users would be created in one project and their rows written to another.
    expect(() => { assertSeedTargets(mixed, { appEnv: 'preview', allowRemote: true, customPassword: true }); }).toThrow(
      /Supabase URL is local but the database URL is not/,
    );
  });

  it('never prints an address, which can hold a password', () => {
    for (const options of [
      { appEnv: 'preview', allowRemote: false, customPassword: false },
      { appEnv: 'preview', allowRemote: true, customPassword: false },
    ]) {
      expect(() => { assertSeedTargets(hostedTargets, options); }).toThrow(/^(?!.*secret).*$/);
    }
  });

  it('refuses production whatever the flags say', () => {
    expect(() => { assertSeedTargets(localTargets, { appEnv: 'production', allowRemote: true, customPassword: true }); }).toThrow(
      /production/,
    );
  });
});
