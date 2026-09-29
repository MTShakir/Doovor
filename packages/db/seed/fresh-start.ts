/**
 * Empties a database and leaves one super admin behind, for a launch (RUNBOOK 3.9).
 *
 * Everything people made goes: every account, Business, lesson, payment, note, picture and log.
 * What stays is the reference data the app needs to work at all, listed in `KEEP` below, and one
 * super admin created from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
 *
 * It is destructive and there is no undo, so it asks for the target twice. `--project` has to
 * name the project reference in the Supabase URL: a `.env.local` left pointing somewhere else
 * then refuses instead of emptying the wrong database. `--yes` has to be there as well.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm db:fresh --project=yvxuarrrvgnfcjfyqfyi --yes
 *
 * Run it against the local stack with `--project=local`.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { isLocalUrl } from './guard';

const root = path.resolve(import.meta.dirname, '../../..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * The tables a fresh database still needs: the places the public pages are built from, the skill
 * map every lesson record is written against, the postcode cache, and the platform's own
 * settings. Everything else in `public` is emptied, which is the safe way round: a table added
 * later holds somebody's data until it is deliberately listed here.
 */
const KEEP = ['cities', 'city_districts', 'marketplace_regions', 'skills', 'platform_settings', 'postcodes'];

/** Progress, the way the seed reports it: straight to stdout rather than through console. */
function say(line: string): void {
  process.stdout.write(`${line}
`);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

function argument(name: string): string | undefined {
  return process.argv.find((one) => one.startsWith(`--${name}=`))?.split('=')[1];
}

/** The project a Supabase URL belongs to: `https://<ref>.supabase.co`, or "local". */
function projectOf(url: string): string {
  if (isLocalUrl(url)) return 'local';
  const host = new URL(url).hostname;
  return host.split('.')[0] ?? host;
}

async function main(): Promise<void> {
  const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
  const secretKey = required('SUPABASE_SECRET_KEY');
  const dbUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const email = required('ADMIN_EMAIL');
  const password = required('ADMIN_PASSWORD');
  const named = argument('project');

  // Say what is being emptied, and have it match what this machine is pointed at (D-227).
  const target = projectOf(supabaseUrl);
  if (!named) {
    throw new Error(`Refusing to empty anything: name the project with --project=${target}. Nothing has been touched.`);
  }
  if (named !== target) {
    throw new Error(`Refusing to empty ${target}: --project says ${named}. Check .env.local is pointed where you think. Nothing has been touched.`);
  }
  const databaseIsLocal = isLocalUrl(`https://${new URL(dbUrl).hostname}`);
  if (databaseIsLocal !== (target === 'local')) {
    throw new Error('Refusing to empty: the Supabase URL and the database URL are not the same kind of target. Point both at one project. Nothing has been touched.');
  }
  if (!process.argv.includes('--yes')) {
    throw new Error(`Refusing to empty ${target} without --yes. Nothing has been touched.`);
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD is shorter than 12 characters. The one account that can see everything needs a real password.');
  }

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const sql = postgres(dbUrl, { max: 1 });

  try {
    // 1. The pictures and files people uploaded, through the storage API so the objects go and
    //    not only the rows that point at them.
    const { data: buckets, error: noBuckets } = await admin.storage.listBuckets();
    if (noBuckets) throw new Error(`Could not read the buckets: ${noBuckets.message}`);
    for (const bucket of buckets) {
      let removed = 0;
      for (;;) {
        const { data: objects, error } = await admin.storage.from(bucket.id).list(undefined, { limit: 100 });
        if (error) throw new Error(`Could not read the ${bucket.id} bucket: ${error.message}`);
        const paths = await pathsUnder(admin, bucket.id, objects);
        if (paths.length === 0) break;
        const { error: gone } = await admin.storage.from(bucket.id).remove(paths);
        if (gone) throw new Error(`Could not empty the ${bucket.id} bucket: ${gone.message}`);
        removed += paths.length;
      }
      say(`  ${bucket.id}: ${String(removed)} files removed`);
    }

    // 2. Every table in public except the reference data, in one statement so the foreign keys
    //    between them do not decide the order. It fails rather than cascading, so a table that
    //    should have been emptied and was not is loud.
    // `private` goes with it: what is in there is counters kept per Business, so a row that
    //  outlived its Business would number the first receipt of a new one from where the old one
    //  stopped. Without this the truncate refuses, which is how it was found.
    const tables = await sql<{ schema: string; name: string }[]>`
      select n.nspname as schema, c.relname as name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r'
         and (n.nspname = 'private' or (n.nspname = 'public' and c.relname not in ${sql(KEEP)}))
       order by n.nspname, c.relname`;
    const names = tables.map((one) => `${one.schema}."${one.name}"`);

    // The audit log and the credit ledger refuse to be truncated, on purpose: they are written
    // once and never changed (D-013). A fresh start is the one time they go, so their guards are
    // lifted for the statement and put back, inside a transaction so a failure cannot leave them
    // off. Any other table that grows such a guard later is found the same way.
    const guards = await sql<{ schema: string; table: string; trigger: string }[]>`
      select n.nspname as schema, c.relname as "table", t.tgname as trigger
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and (t.tgtype & 32) <> 0
         and (n.nspname = 'private' or (n.nspname = 'public' and c.relname not in ${sql(KEEP)}))`;

    await sql.begin(async (tx) => {
      for (const guard of guards) {
        await tx.unsafe(`alter table ${guard.schema}."${guard.table}" disable trigger "${guard.trigger}"`);
      }
      await tx.unsafe(`truncate table ${names.join(', ')} restart identity`);
      for (const guard of guards) {
        await tx.unsafe(`alter table ${guard.schema}."${guard.table}" enable trigger "${guard.trigger}"`);
      }
    });
    say(`  ${String(names.length)} tables emptied, ${String(KEEP.length)} kept: ${KEEP.join(', ')}`);
    if (guards.length > 0) {
      say(`  append-only guards lifted for the statement and put back: ${guards.map((one) => one.table).join(', ')}`);
    }

    // 3. The accounts themselves, which the public tables no longer point at.
    const removedAccounts = await sql<{ count: number }[]>`
      with gone as (delete from auth.users returning 1) select count(*)::int as count from gone`;
    say(`  ${String(removedAccounts[0]?.count ?? 0)} accounts removed`);

    // 4. One super admin, made the way every account is made, so the password is hashed by
    //    Supabase Auth and never by us.
    const { data: made, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: process.env.ADMIN_NAME ?? 'Platform admin' },
    });
    if (error) throw new Error(`Could not create the admin: ${error.message}`);
    await sql`insert into public.platform_staff (user_id, role) values (${made.user.id}::uuid, 'super_admin')`;
    say(`  super admin created: ${email}`);
    say(`\n${target} is empty and ready. Sign in at /sign-in and set up two-step verification straight away.`);
  } finally {
    await sql.end();
  }
}

/** Every file under a bucket, folder by folder: `list` only answers one level at a time. */
async function pathsUnder(
  admin: SupabaseClient,
  bucket: string,
  entries: { name: string; id: string | null }[],
  prefix = '',
): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of entries) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A row with no id is a folder, which holds the files people actually uploaded.
    if (entry.id === null) {
      const { data: inside } = await admin.storage.from(bucket).list(full, { limit: 100 });
      paths.push(...(await pathsUnder(admin, bucket, inside ?? [], full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
