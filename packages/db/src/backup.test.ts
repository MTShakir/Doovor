import { describe, expect, it } from 'vitest';
import { BackupError, backupName, backupsToRemove, checkPassphrase, notOurData, openBackup, restorableRoles, sealBackup, type BackupFiles } from './backup';

const files: BackupFiles = {
  'roles.sql': 'create role example;',
  'schema.sql': 'create table public.example (id int);',
  'data.sql': 'copy public.example (id) from stdin;\n1\n\\.\n',
};
const passphrase = 'correct horse battery staple';
const at = new Date('2026-09-19T14:30:00Z');

describe('encrypted database backups (NFR-SEC-07, D-161)', () => {
  it('opens with the passphrase it was sealed with, and gives back exactly what went in', () => {
    const sealed = sealBackup(files, passphrase, { createdAt: at, source: 'hosted' });
    expect(openBackup(sealed, passphrase)).toEqual({ files, createdAt: at.toISOString(), source: 'hosted' });
  });

  it('shows nothing of what is inside, nor the passphrase', () => {
    const sealed = sealBackup(files, passphrase, { createdAt: at, source: 'hosted' });
    expect(sealed).not.toContain('create table');
    expect(sealed).not.toContain('copy public');
    expect(sealed).not.toContain(passphrase);
  });

  it('refuses the wrong passphrase, and a file changed since it was made', () => {
    const sealed = sealBackup(files, passphrase, { createdAt: at, source: 'hosted' });
    expect(() => openBackup(sealed, 'not the passphrase at all')).toThrow(BackupError);

    const changed = JSON.parse(sealed) as { data: string };
    const bytes = Buffer.from(changed.data, 'base64');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    changed.data = bytes.toString('base64');
    expect(() => openBackup(JSON.stringify(changed), passphrase)).toThrow('changed since it was made');
    expect(() => openBackup('not a backup', passphrase)).toThrow('not a backup');
  });

  it('refuses a passphrase too short to protect everybody in the database', () => {
    expect(() => checkPassphrase(undefined)).toThrow(BackupError);
    expect(() => checkPassphrase('fifteen chars!!')).toThrow('at least 16 characters');
    expect(checkPassphrase('sixteen chars!!!')).toBe('sixteen chars!!!');
    expect(() => sealBackup(files, 'short', { createdAt: at, source: 'local' })).toThrow(BackupError);
  });

  it('leaves Supabase\'s own roles out of the roles file, and keeps ours', () => {
    const dumped = [
      'ALTER ROLE "anon" SET "statement_timeout" TO \'3s\';',
      'ALTER ROLE "authenticator" SET "pgrst.db_pre_request" TO \'private.check_request\';',
      'GRANT SET ON PARAMETER "log_min_messages" TO "supabase_realtime_admin";',
      'RESET ALL;',
    ].join('\n');
    const kept = restorableRoles(dumped);
    expect(kept).not.toContain('supabase_realtime_admin');
    expect(kept).toContain('"statement_timeout" TO \'3s\'');
    expect(kept).toContain('private.check_request');
    expect(kept.split('\n')[0]).toBe("-- 1 line about Supabase's own roles left out: a new project has them already.");
    expect(restorableRoles('RESET ALL;')).toBe('RESET ALL;');
  });

  it("leaves out only Supabase's own storage and hook tables, never ours or anybody's sign in", () => {
    for (const table of notOurData) expect(table).toMatch(/^(storage|supabase_functions)\./);
    expect(notOurData).not.toContain('storage.objects');
    expect(notOurData).not.toContain('storage.buckets');
  });

  it('names a backup by when it was made, in UTC, so names sort in order', () => {
    expect(backupName(at)).toBe('database-2026-09-19-1430.backup');
    expect(backupName(new Date('2027-01-02T03:04:00Z'))).toBe('database-2027-01-02-0304.backup');
  });

  it('removes backups past five weeks, and nothing else in the folder', () => {
    // Five weeks before this is 27 September at noon.
    const now = new Date('2026-11-01T12:00:00Z');
    const names = [
      'database-2026-09-19-1430.backup',
      'database-2026-09-26-1000.backup',
      'database-2026-10-31-0900.backup',
      'notes.txt',
      'database-2026-09-01-0000.sql',
    ];
    expect(backupsToRemove(names, now)).toEqual(['database-2026-09-19-1430.backup', 'database-2026-09-26-1000.backup']);
  });

  it('keeps the newest backup however old it is, so there is always one to go back to', () => {
    const now = new Date('2027-06-01T00:00:00Z');
    expect(backupsToRemove(['database-2026-09-19-1430.backup', 'database-2026-10-01-0800.backup'], now)).toEqual([
      'database-2026-09-19-1430.backup',
    ]);
    expect(backupsToRemove(['notes.txt'], now)).toEqual([]);
  });
});
