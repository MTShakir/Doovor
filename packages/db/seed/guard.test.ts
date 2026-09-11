import { describe, expect, it } from 'vitest';
import { assertSeedTargets, isLocalUrl } from './guard';

const localApi = { label: 'Supabase URL', url: 'http://127.0.0.1:54321' };
const localDb = { label: 'database URL', url: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' };
const localTargets = [localApi, localDb];

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
    expect(() => { assertSeedTargets(localTargets, { appEnv: 'local', allowRemote: false }); }).not.toThrow();
  });

  it('refuses when any target is remote, including only the database', () => {
    const remoteDb = [localApi, { label: 'database URL', url: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' }];
    expect(() => { assertSeedTargets(remoteDb, { appEnv: 'local', allowRemote: false }); }).toThrow(/database URL is not local/);
  });

  it('never prints the address, which can hold a password', () => {
    const remoteDb = [{ label: 'database URL', url: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' }];
    expect(() => { assertSeedTargets(remoteDb, { appEnv: 'local', allowRemote: false }); }).toThrow(/^(?!.*secret).*$/);
  });

  it('seeds a remote staging project only when asked', () => {
    const remote = [{ label: 'Supabase URL', url: 'https://staging.supabase.co' }];
    expect(() => { assertSeedTargets(remote, { appEnv: 'staging', allowRemote: true }); }).not.toThrow();
  });

  it('refuses production whatever the flags say', () => {
    expect(() => { assertSeedTargets(localTargets, { appEnv: 'production', allowRemote: true }); }).toThrow(/production/);
  });
});
