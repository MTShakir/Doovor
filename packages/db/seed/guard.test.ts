import { describe, expect, it } from 'vitest';
import { assertSeedTargets, databaseUrlFrom, isLocalUrl } from './guard';

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

/**
 * A connection string pasted from Supabase, with a real person's password in it (D-247). The
 * launch wipe said only "Invalid URL" when a password had a # in it, which told nobody anything.
 */
describe('reading a pasted database connection string (D-247)', () => {
  const pooler = 'aws-0-eu-west-2.pooler.supabase.com:5432/postgres';
  const pasted = (password: string) => `postgresql://postgres.yvxuarrrvgnfcjfyqfyi:${password}@${pooler}`;

  /** What a driver would actually connect with, read back out of the string. */
  const readBack = (url: string) => {
    const parsed = new URL(url);
    return {
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port,
      database: parsed.pathname.slice(1),
    };
  };

  it('leaves a plain password as it is', () => {
    const answer = databaseUrlFrom(pasted('LettersAndDigits123'));
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(readBack(answer.url)).toEqual({
      user: 'postgres.yvxuarrrvgnfcjfyqfyi',
      password: 'LettersAndDigits123',
      host: 'aws-0-eu-west-2.pooler.supabase.com',
      port: '5432',
      database: 'postgres',
    });
  });

  it('takes a password with the characters that end the password part of an address', () => {
    // Each of these made the old parser read a host and port out of the middle of the password.
    for (const password of ['ab#cd', 'ab/cd', 'ab?cd', 'p@ss@word', 'a:b', 'all#/?@:%of them', '1234/x']) {
      const answer = databaseUrlFrom(pasted(password));
      expect(answer.ok, password).toBe(true);
      if (!answer.ok) continue;
      expect(readBack(answer.url).password, password).toBe(password);
      expect(readBack(answer.url).host, password).toBe('aws-0-eu-west-2.pooler.supabase.com');
    }
  });

  it('gives the same answer for a password somebody already encoded', () => {
    const answer = databaseUrlFrom(pasted('ab%23cd'));
    expect(answer.ok && readBack(answer.url).password).toBe('ab#cd');
  });

  it('takes the square brackets off a password typed inside the placeholder, and says so', () => {
    const answer = databaseUrlFrom(pasted('[RealPassword]'));
    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(readBack(answer.url).password).toBe('RealPassword');
    expect(answer.note).toMatch(/square brackets/);
  });

  it('refuses the placeholder left as it is', () => {
    const answer = databaseUrlFrom(pasted('[YOUR-PASSWORD]'));
    expect(answer.ok).toBe(false);
    if (!answer.ok) expect(answer.problem).toMatch(/still has \[YOUR-PASSWORD\]/);
  });

  it('says what is wrong with something that is not a connection string at all', () => {
    for (const raw of [
      '',
      'psql -h aws-0-eu-west-2.pooler.supabase.com -p 5432 -U postgres',
      'User Id=postgres;Password=secret;Server=aws-0-eu-west-2.pooler.supabase.com',
      'postgresql://no-password-here.pooler.supabase.com:5432/postgres',
      'postgresql://postgres.ref@aws-0-eu-west-2.pooler.supabase.com:5432/postgres',
    ]) {
      const answer = databaseUrlFrom(raw);
      expect(answer.ok, raw).toBe(false);
    }
  });

  it('never repeats the password in what it says, whatever went wrong', () => {
    const secret = 'Sup3rS3cret#Pass';
    for (const raw of [
      `postgres.ref:${secret}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
      `postgresql://postgres.ref:${secret}@`,
      `postgresql://postgres.ref${secret}@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    ]) {
      const answer = databaseUrlFrom(raw);
      expect(answer.ok).toBe(false);
      if (!answer.ok) expect(answer.problem).not.toContain(secret);
    }
  });
});
