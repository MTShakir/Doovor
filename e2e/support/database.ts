import postgres from 'postgres';

/**
 * A direct connection to the local database, for the tests that have to change something
 * from outside the app: a realtime diary is only proved by a change the page did not make.
 *
 * Local only. There is no path from here to a hosted project, and nothing in the app uses
 * this module.
 */
export const databaseUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(databaseUrl)) {
  throw new Error('The end to end tests only ever change the local database.');
}

export async function withDatabase<T>(work: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Who a learner is linked to, found by the email they signed up with. An invitation is only
 * really accepted if this row exists, and no page shows it until the CRM arrives (M2-04).
 */
export async function learnerInstructorName(email: string): Promise<string | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ display_name: string }[]>`
      select p.display_name
        from public.learner_relationships r
        join auth.users u on u.id = r.learner_id
        join public.instructor_profiles p on p.id = r.instructor_id
       where lower(u.email) = lower(${email})`;
    return rows[0]?.display_name ?? null;
  });
}

/** Sets a booking's status, as another person or a job would. Returns what it was. */
export async function setBookingStatus(
  instructorName: string,
  startsAt: string,
  status: 'confirmed' | 'cancelled' | 'requested',
): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ status: string }[]>`
      update public.bookings b
         set status = ${status}::public.booking_status,
             cancelled_at = case when ${status} = 'cancelled' then now() end
        from public.instructor_profiles p
       where p.id = b.instructor_id
         and p.display_name = ${instructorName}
         and b.starts_at = ${startsAt}::timestamptz
      returning (select status from public.bookings where id = b.id)::text as status`;
    if (rows.length === 0) throw new Error(`No lesson for ${instructorName} at ${startsAt}`);
    return rows[0]?.status ?? status;
  });
}

/**
 * Clears one instructor's lessons on one local day, so a booking test starts from an empty
 * diary however the last run ended. Local only, like everything in this module.
 */
export async function clearDiary(instructorName: string, date: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      delete from public.bookings b
       using public.instructor_profiles p
       where p.id = b.instructor_id
         and p.display_name = ${instructorName}
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date`;
  });
}
