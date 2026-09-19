import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Encrypted backups of the hosted database, while it is on Supabase's free plan, which keeps none
 * (NFR-SEC-07, D-161). `pnpm db:backup` dumps the roles, the schema and the data the way Supabase's
 * own guide does, seals the three files with a passphrase, and keeps five weeks of them.
 *
 * A backup holds everybody's personal data, so it is never written anywhere unencrypted, and the
 * privacy notice says how long it is kept. AES-256-GCM refuses anything tampered with; the key comes
 * from the passphrase through scrypt, so a stolen file is no use without the passphrase.
 */

/** The three files Supabase's backup guide makes, and restores in this order. */
export const backupParts = ['roles.sql', 'schema.sql', 'data.sql'] as const;
export type BackupPart = (typeof backupParts)[number];
export type BackupFiles = Record<BackupPart, string>;

/**
 * Tables the data dump leaves out: Supabase's own, for features we do not use, which a new project
 * sets up for itself and the restore may not write to. Of storage, the buckets and the record of
 * each file are kept; the files themselves stay in Supabase Storage.
 */
export const notOurData = [
  'storage.buckets_analytics',
  'storage.buckets_vectors',
  'storage.iceberg_namespaces',
  'storage.iceberg_tables',
  'storage.s3_multipart_uploads',
  'storage.s3_multipart_uploads_parts',
  'storage.vector_indexes',
  'supabase_functions.hooks',
] as const;

/** A passphrase shorter than this is refused: it is kept in a password manager, never typed often. */
export const minPassphraseLength = 16;

/** How long a backup is kept, which the privacy notice promises (NFR-PRV-03). */
export const keepForDays = 35;

const format = 1;
// 2^15: about a tenth of a second and 32 MB to try one passphrase.
const scryptCost = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

interface SealedBackup {
  format: number;
  createdAt: string;
  source: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export class BackupError extends Error {}

export function checkPassphrase(passphrase: string | undefined): string {
  if (!passphrase || passphrase.length < minPassphraseLength) {
    throw new BackupError(
      `BACKUP_PASSPHRASE in .env.local must be at least ${String(minPassphraseLength)} characters. Keep a copy somewhere other than this computer: without it no backup can be opened.`,
    );
  }
  return passphrase;
}

function keyFrom(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32, scryptCost);
}

/** Seals the three files into one JSON document nobody can read without the passphrase. */
export function sealBackup(files: BackupFiles, passphrase: string, meta: { createdAt: Date; source: string }): string {
  const key = checkPassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(key, salt), iv);
  const plain = gzipSync(Buffer.from(JSON.stringify(files), 'utf8'));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const sealed: SealedBackup = {
    format,
    createdAt: meta.createdAt.toISOString(),
    source: meta.source,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  return JSON.stringify(sealed);
}

/** Opens a sealed backup, or says why it cannot: the wrong passphrase, or a damaged file. */
export function openBackup(sealed: string, passphrase: string): { files: BackupFiles; createdAt: string; source: string } {
  let parsed: SealedBackup;
  try {
    parsed = JSON.parse(sealed) as SealedBackup;
  } catch {
    throw new BackupError('This is not a backup made by pnpm db:backup.');
  }
  if (parsed.format !== format) throw new BackupError(`This backup is in format ${String(parsed.format)}, which this version cannot open.`);
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(passphrase, Buffer.from(parsed.salt, 'base64')), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]);
  } catch {
    throw new BackupError('That passphrase does not open this backup, or the file has been changed since it was made.');
  }
  const files = JSON.parse(gunzipSync(plain).toString('utf8')) as BackupFiles;
  return { files, createdAt: parsed.createdAt, source: parsed.source };
}

/**
 * The roles file without what belongs to Supabase itself. A new project already has its own roles
 * (supabase_admin, supabase_realtime_admin and the rest) set up, and the postgres user a restore
 * runs as may not change them, so one such line stops the whole restore. What is ours stays: the
 * statement timeouts, and the check every request makes that its session is still live (D-041).
 */
export function restorableRoles(sql: string): string {
  const lines = sql.split('\n');
  const ours = lines.filter((line) => !/"supabase_[a-z_]*"/.test(line));
  const left = lines.length - ours.length;
  if (left === 0) return sql;
  return [`-- ${String(left)} line${left === 1 ? '' : 's'} about Supabase's own roles left out: a new project has them already.`, ...ours].join('\n');
}

const namePattern = /^database-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.backup$/;

/** database-2026-09-19-1430.backup, in UTC, so the names sort in the order they were made. */
export function backupName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `database-${String(at.getUTCFullYear())}-${two(at.getUTCMonth() + 1)}-${two(at.getUTCDate())}-${two(at.getUTCHours())}${two(at.getUTCMinutes())}.backup`;
}

/**
 * The backups in a folder that are past their five weeks, by the time in their name. The newest
 * is never one of them, however old, so there is always one to go back to. Anything else in the
 * folder is left alone.
 */
export function backupsToRemove(names: string[], now: Date): string[] {
  const dated = names.flatMap((name) => {
    const match = namePattern.exec(name);
    if (!match) return [];
    const [, year, month, day, hour, minute] = match.map(Number);
    return [{ name, at: Date.UTC(year ?? 0, (month ?? 1) - 1, day, hour, minute) }];
  });
  const newest = Math.max(...dated.map((one) => one.at));
  const cutoff = now.getTime() - keepForDays * 24 * 3_600_000;
  return dated.filter((one) => one.at < cutoff && one.at !== newest).map((one) => one.name);
}
