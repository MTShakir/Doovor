import postgres from 'postgres';

/**
 * A direct connection to the local database, for the tests that have to change something
 * from outside the app: a realtime diary is only proved by a change the page did not make.
 *
 * Local only. There is no path from here to a hosted project, and nothing in the app uses
 * this module.
 */
const url = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  throw new Error('The end to end tests only ever change the local database.');
}

export async function withDatabase<T>(work: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(url, { max: 1 });
  try {
    return await work(sql);
  } finally {
    await sql.end();
  }
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
