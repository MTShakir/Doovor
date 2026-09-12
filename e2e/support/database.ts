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

export interface SeededLesson {
  startsAt: string;
  /** The local day and time, as the diary shows them. */
  date: string;
  time: string;
  learnerName: string;
}

/**
 * A lesson the seed actually made, found rather than remembered. The seed is anchored to
 * the day it ran, so a date written into a test goes stale the moment the clock moves on.
 */
export async function findLesson(instructorName: string, status: string): Promise<SeededLesson> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ starts_at: string; date: string; time: string; learner_name: string }[]>`
      select b.starts_at,
             to_char(b.starts_at at time zone 'Europe/London', 'YYYY-MM-DD') as date,
             to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') as time,
             u.full_name as learner_name
        from public.bookings b
        join public.instructor_profiles p on p.id = b.instructor_id
        join public.users u on u.id = b.learner_id
       where p.display_name = ${instructorName}
         and b.status = ${status}::public.booking_status
         and b.starts_at > now()
       order by b.starts_at
       limit 1`;
    const found = rows[0];
    if (!found) throw new Error(`The seed has no ${status} lesson for ${instructorName}`);
    return {
      startsAt: new Date(found.starts_at).toISOString(),
      date: found.date,
      time: found.time,
      learnerName: found.learner_name,
    };
  });
}

/**
 * Puts a lesson request in an instructor's diary, as a learner self-booking would when that
 * instructor answers their own requests (BOK-06). Local only.
 */
export async function requestLesson(instructorName: string, learnerEmail: string, localStart: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                   buffer_minutes, status, price_pence, source, expires_at)
      select p.business_id, p.id, u.id, t.id,
             ${localStart}::timestamp at time zone 'Europe/London',
             (${localStart}::timestamp + interval '1 hour') at time zone 'Europe/London',
             30, 'requested', 4200, 'self', now() + interval '6 hours'
        from public.instructor_profiles p
        join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
        join public.users u on lower(u.email) = lower(${learnerEmail})
       where p.display_name = ${instructorName}`;
  });
}
