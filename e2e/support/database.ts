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
 * Keeps the one Business that takes payments in these tests to one spec at a time (M3-07).
 *
 * The 390 px and 1440 px runs of a file go at the same moment, and a payments test switches the
 * school's card payments on and off. One switching them off while the other is half way through
 * paying fails the other, for a reason that has nothing to do with the app. A session lock in
 * the database makes the two take turns; the database lets it go on its own if a run dies.
 * Returns the function that lets it go.
 */
export async function holdPaymentsBusiness(): Promise<() => Promise<void>> {
  const sql = postgres(databaseUrl, { max: 1, idle_timeout: 0, max_lifetime: null });
  await sql`select pg_advisory_lock(hashtext('e2e:payments-business'))`;
  return async () => {
    await sql`select pg_advisory_unlock(hashtext('e2e:payments-business'))`;
    await sql.end();
  };
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
 *
 * Every spec that clears a diary books on a weekday of its own, because clearing a day takes
 * out whatever another spec had just put there:
 *
 * | Weekday   | Spec                  |
 * |-----------|-----------------------|
 * | Monday    | learner-lessons       |
 * | Tuesday   | self-booking          |
 * | Wednesday | booking               |
 * | Thursday  | booking-requests      |
 * | Friday    | acceptance            |
 * | Saturday  | offline-payments      |
 *
 * Within a weekday, each width takes its own week, because both widths run at once.
 */
export async function clearDiary(instructorName: string, date: string): Promise<void> {
  await withDatabase(async (sql) => {
    // A lesson with a record is kept in the app (D-100); a test clearing its day takes the record too.
    await sql`
      delete from public.lesson_records r
       using public.bookings b, public.instructor_profiles p
       where r.booking_id = b.id
         and p.id = b.instructor_id
         and p.display_name = ${instructorName}
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date`;
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
 *
 * The day and the time are separate on purpose: a whole timestamp handed to the driver as a
 * string is read back as an instant in somebody's zone, and the hour quietly moves in summer.
 */
export async function requestLesson(
  instructorName: string,
  learnerEmail: string,
  date: string,
  time: string,
): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                   buffer_minutes, status, price_pence, source, expires_at)
      select p.business_id, p.id, u.id, t.id,
             (${date}::date + ${time}::time) at time zone 'Europe/London',
             (${date}::date + ${time}::time + interval '1 hour') at time zone 'Europe/London',
             30, 'requested', 4200, 'self', now() + interval '6 hours'
        from public.instructor_profiles p
        join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
        join public.users u on lower(u.email) = lower(${learnerEmail})
       where p.display_name = ${instructorName}`;
  });
}

/** Confirms whatever is waiting in an instructor's diary on one local day. Local only. */
export async function acceptRequests(instructorName: string, date: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      update public.bookings b
         set status = 'confirmed', expires_at = null
        from public.instructor_profiles p
       where p.id = b.instructor_id
         and p.display_name = ${instructorName}
         and b.status = 'requested'
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date`;
  });
}

/** Takes one lesson out of the database, whatever became of it. Local only. */
export async function removeLesson(
  instructorName: string,
  learnerEmail: string,
  date: string,
  time: string,
): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      delete from public.lesson_records r
       using public.bookings b, public.instructor_profiles p, public.users u
       where r.booking_id = b.id
         and p.id = b.instructor_id
         and u.id = b.learner_id
         and p.display_name = ${instructorName}
         and lower(u.email) = lower(${learnerEmail})
         and b.starts_at = (${date}::date + ${time}::time) at time zone 'Europe/London'`;
    await sql`
      delete from public.bookings b
       using public.instructor_profiles p, public.users u
       where p.id = b.instructor_id
         and u.id = b.learner_id
         and p.display_name = ${instructorName}
         and lower(u.email) = lower(${learnerEmail})
         and b.starts_at = (${date}::date + ${time}::time) at time zone 'Europe/London'`;
  });
}

/**
 * Puts a confirmed lesson in a learner's diary, as their instructor booking it would. Whatever
 * was at that moment is cleared first, so a rerun starts where the last one did rather than
 * tripping over what it left. Local only, like everything in this module.
 */
export async function bookLesson(
  instructorName: string,
  learnerEmail: string,
  date: string,
  time: string,
  options: { durationMinutes?: number; link?: boolean; paymentMode?: 'offline' | 'before_lesson' } = {},
): Promise<void> {
  const durationMinutes = options.durationMinutes ?? 60;
  const paymentMode = options.paymentMode ?? 'offline';
  await removeLesson(instructorName, learnerEmail, date, time);
  await withDatabase(async (sql) => {
    // Booking through the app makes the learner one of that Business's learners, and some
    // screens assume that link (create_booking does this itself). Only the tests that need it
    // ask for it, because it also puts the learner on that Business's own lists.
    if (options.link === true) {
      await sql`
        insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
        select p.business_id, u.id, p.id, 'active', 'marketplace'
          from public.instructor_profiles p
          join public.users u on lower(u.email) = lower(${learnerEmail})
         where p.display_name = ${instructorName}
        on conflict do nothing`;
    }
    await sql`
      insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                   buffer_minutes, status, payment_mode, price_pence, source)
      select p.business_id, p.id, u.id, t.id,
             (${date}::date + ${time}::time) at time zone 'Europe/London',
             (${date}::date + ${time}::time + make_interval(mins => ${durationMinutes})) at time zone 'Europe/London',
             30, 'confirmed', ${paymentMode}::public.booking_payment_mode, 4200, 'instructor'
        from public.instructor_profiles p
        join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
        join public.users u on lower(u.email) = lower(${learnerEmail})
       where p.display_name = ${instructorName}`;
  });
}

/** Everything one person has been told, cleared so a test starts from a quiet inbox. */
export async function clearNotifications(email: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      delete from public.notifications n
       using public.users u
       where u.id = n.user_id and lower(u.email) = lower(${email})`;
    await sql`
      delete from public.notification_preferences p
       using public.users u
       where u.id = p.user_id and lower(u.email) = lower(${email})`;
  });
}

export interface SeededNotification {
  kind: string;
  category: 'bookings' | 'reminders' | 'money' | 'account';
  title: string;
  body: string;
  link?: string | null;
}

/** Writes what a job would have written, as the job does: through system_notify. Local only. */
export async function notify(email: string, one: SeededNotification): Promise<void> {
  await withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`select id from public.users where lower(email) = lower(${email})`;
    const userId = rows[0]?.id;
    if (!userId) throw new Error(`No account for ${email}`);
    const row = {
      user_id: userId,
      kind: one.kind,
      category: one.category,
      title: one.title,
      body: one.body,
      link: one.link ?? null,
      channels: ['in_app', 'push'],
      dedupe_key: `${one.kind}:${userId}:${one.title}`,
    };
    await sql`select public.system_notify(${sql.json([row])})`;
  });
}

/** Browsers this account has signed up for push, cleared before a test and counted after. */
export async function clearPushSubscriptions(email: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      delete from public.push_subscriptions s
       using public.users u
       where u.id = s.user_id and lower(u.email) = lower(${email})`;
  });
}

export async function countPushSubscriptions(email: string): Promise<number> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count
        from public.push_subscriptions s
        join public.users u on u.id = s.user_id
       where lower(u.email) = lower(${email})`;
    return Number(rows[0]?.count ?? '0');
  });
}

export interface LessonRow {
  startsAt: string;
  time: string;
  learnerName: string;
  status: string;
}

/** One instructor's lessons on one local day, in order. Local only. */
export async function lessonsOn(instructorName: string, date: string): Promise<LessonRow[]> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ starts_at: string; time: string; learner_name: string; status: string }[]>`
      select b.starts_at,
             to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') as time,
             u.full_name as learner_name,
             b.status::text as status
        from public.bookings b
        join public.instructor_profiles p on p.id = b.instructor_id
        join public.users u on u.id = b.learner_id
       where p.display_name = ${instructorName}
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date
       order by b.starts_at`;
    return rows.map((row) => ({
      startsAt: new Date(row.starts_at).toISOString(),
      time: row.time,
      learnerName: row.learner_name,
      status: row.status,
    }));
  });
}

/**
 * Winds a hold back and sweeps, which is the only clock a hold has (R-10, M3-06). Returns how
 * many slots went back to the diary, so a test can say it happened rather than assume it.
 */
export async function expireHoldsNow(instructorName: string, date: string): Promise<number> {
  return withDatabase(async (sql) => {
    await sql`
      update public.bookings b
         set hold_expires_at = now() - interval '1 minute'
        from public.instructor_profiles p
       where p.id = b.instructor_id
         and p.display_name = ${instructorName}
         and (b.starts_at at time zone 'Europe/London')::date = ${date}::date
         and b.status = 'pending_payment'`;
    const rows = await sql<{ expired: number }[]>`
      select (public.system_expire_payment_holds() ->> 'expired')::int as expired`;
    return rows[0]?.expired ?? 0;
  });
}

/**
 * Puts a lesson booked to be paid afterwards into the past, marked done, as it is once the
 * instructor presses Complete (PAY-03, M3-10). Local only.
 */
export async function finishedLessonOwed(instructorName: string, learnerEmail: string, daysAgo: number, time: string): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      with day as (select (current_date - ${daysAgo}::int) as d)
      insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                   buffer_minutes, status, payment_mode, price_pence, source)
      select p.business_id, p.id, u.id, t.id,
             ((select d from day) + ${time}::time) at time zone 'Europe/London',
             ((select d from day) + ${time}::time + interval '1 hour') at time zone 'Europe/London',
             30, 'completed', 'after_lesson', 4200, 'instructor'
        from public.instructor_profiles p
        join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
        join public.users u on lower(u.email) = lower(${learnerEmail})
       where p.display_name = ${instructorName}
      returning id`;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not put a finished lesson in ${instructorName}'s diary`);
    return id;
  });
}

/** Takes a lesson out by its id, whatever became of it. Local only. */
export async function removeLessonById(id: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`delete from public.lesson_records where booking_id = ${id}`;
    await sql`delete from public.bookings where id = ${id}`;
  });
}

/** Forgets the payments account a Business connected, so a test starts from nothing. */
export async function clearPaymentsAccount(ownerEmail: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      update public.businesses b
         set stripe_account_id = null,
             stripe_charges_enabled = false,
             stripe_payouts_enabled = false,
             stripe_details_submitted = false,
             stripe_connected_at = null
        from public.memberships m
        join public.users u on u.id = m.user_id
       where m.business_id = b.id
         and m.role = 'owner'
         and lower(u.email) = lower(${ownerEmail})`;
  });
}

/** The account a Business is connected to, as the database has it. */
export async function paymentsAccountOf(ownerEmail: string): Promise<string | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ stripe_account_id: string | null }[]>`
      select b.stripe_account_id
        from public.businesses b
        join public.memberships m on m.business_id = b.id and m.role = 'owner'
        join public.users u on u.id = m.user_id
       where lower(u.email) = lower(${ownerEmail})`;
    return rows[0]?.stripe_account_id ?? null;
  });
}

/** How many times an event from the payments provider was recorded (R-11). */
export async function countProviderEvents(eventId: string): Promise<number> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ count: string }[]>`
      select count(*)::text as count from public.provider_events where event_id = ${eventId}`;
    return Number(rows[0]?.count ?? '0');
  });
}

/**
 * Puts a Business in a state where it can take cards, without walking the connect flow.
 * Local only. Returns the account id the fake provider will be asked about.
 */
export async function enablePayments(ownerEmail: string, accountId: string): Promise<string> {
  await withDatabase(async (sql) => {
    // Paid at booking, as a Business is until it chooses otherwise, whatever a test left behind.
    await sql`
      update public.businesses b
         set stripe_account_id = ${accountId},
             stripe_charges_enabled = true,
             stripe_payouts_enabled = true,
             stripe_details_submitted = true,
             stripe_connected_at = now(),
             settings = coalesce(b.settings, '{}'::jsonb) - 'payment_mode'
        from public.memberships m
        join public.users u on u.id = m.user_id
       where m.business_id = b.id and m.role = 'owner' and lower(u.email) = lower(${ownerEmail})`;
  });
  return accountId;
}

/** What a lesson's payment came to, for a test that has just paid for one. */
export async function paymentFor(startsAt: string): Promise<{ amountPence: number; status: string } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ amount_pence: number; status: string }[]>`
      select p.amount_pence, p.status::text as status
        from public.payments p
        join public.bookings b on b.id = p.booking_id
       where b.starts_at = ${startsAt}::timestamptz
       order by p.created_at desc
       limit 1`;
    const found = rows[0];
    return found ? { amountPence: found.amount_pence, status: found.status } : null;
  });
}

/**
 * A learner's credit with the Business an owner runs (PAY-04): the minutes they can book with now,
 * and how many lots they came in. Credit is never taken away by a test, so tests compare before
 * with after.
 */
export async function creditWith(learnerEmail: string, ownerEmail: string): Promise<{ minutes: number; lots: number }> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ minutes: string; lots: string }[]>`
      select coalesce(sum(l.minutes_remaining) filter (where l.expires_at is null or l.expires_at > now()), 0)::text as minutes,
             count(l.id)::text as lots
        from public.credit_lots l
        join public.users learner on learner.id = l.learner_id
        join public.memberships m on m.business_id = l.business_id and m.role = 'owner'
        join public.users owner on owner.id = m.user_id
       where lower(learner.email) = lower(${learnerEmail})
         and lower(owner.email) = lower(${ownerEmail})`;
    return { minutes: Number(rows[0]?.minutes ?? '0'), lots: Number(rows[0]?.lots ?? '0') };
  });
}

/** What a webhook for buying a package needs to say: the package, its Business and the learner. */
export async function packagePurchaseParts(
  ownerEmail: string,
  packageName: string,
  learnerEmail: string,
): Promise<{ packageId: string; businessId: string; learnerId: string; minutes: number; pricePence: number }> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string; business_id: string; learner_id: string; minutes: number; price_pence: number }[]>`
      select p.id, p.business_id, learner.id as learner_id, p.minutes, p.price_pence
        from public.packages p
        join public.memberships m on m.business_id = p.business_id and m.role = 'owner'
        join public.users owner on owner.id = m.user_id
        join public.users learner on lower(learner.email) = lower(${learnerEmail})
       where lower(owner.email) = lower(${ownerEmail})
         and p.name = ${packageName}
       limit 1`;
    const found = rows[0];
    if (!found) throw new Error(`No package called ${packageName} for ${ownerEmail}`);
    return {
      packageId: found.id,
      businessId: found.business_id,
      learnerId: found.learner_id,
      minutes: found.minutes,
      pricePence: found.price_pence,
    };
  });
}

/** What one payment became (R-11, acceptance-06): its payment rows, its lots and its purchase rows. */
export async function creditFromPayment(providerRef: string): Promise<{ payments: number; lots: number; purchases: number }> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ payments: string; lots: string; purchases: string }[]>`
      select (select count(*) from public.payments where provider_ref = ${providerRef})::text as payments,
             (select count(*) from public.credit_lots l join public.payments p on p.id = l.payment_id
               where p.provider_ref = ${providerRef})::text as lots,
             (select count(*) from public.credit_ledger c join public.payments p on p.id = c.payment_id
               where p.provider_ref = ${providerRef} and c.kind = 'purchase')::text as purchases`;
    const found = rows[0];
    return {
      payments: Number(found?.payments ?? '0'),
      lots: Number(found?.lots ?? '0'),
      purchases: Number(found?.purchases ?? '0'),
    };
  });
}

/**
 * Gives a learner credit with the Business an owner runs, as buying a package does: a card payment
 * and the lot it fills, through the same function the webhook uses. Local only.
 *
 * Lessons are paid from credit first, and the credit ledger keeps every lesson it paid for, so
 * those lessons can never be deleted. Give credit only to learners whose lessons no spec clears
 * away: Emma Clarke's, not Sarah Khan's or Tom Walsh's.
 */
export async function giveCredit(learnerEmail: string, ownerEmail: string, minutes: number, pricePence: number): Promise<void> {
  await withDatabase(async (sql) => {
    await sql.begin(async (tx) => {
      const [who] = await tx<{ business_id: string; learner_id: string }[]>`
        select m.business_id, learner.id as learner_id
          from public.memberships m
          join public.users owner on owner.id = m.user_id
          join public.users learner on lower(learner.email) = lower(${learnerEmail})
         where m.role = 'owner'
           and lower(owner.email) = lower(${ownerEmail})`;
      if (!who) throw new Error(`No Business run by ${ownerEmail}, or no ${learnerEmail}`);
      const [payment] = await tx<{ id: string }[]>`
        insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
        values (${who.business_id}::uuid, ${who.learner_id}::uuid, ${pricePence}, 'card', 'paid', now())
        returning id`;
      if (!payment) throw new Error('The payment was not written');
      await tx`
        select private.add_credit_lot(${who.business_id}::uuid, ${who.learner_id}::uuid, ${minutes}::int, ${pricePence}::int,
                                      ${payment.id}::uuid, null::uuid, null::timestamptz, now(), null::uuid)`;
    });
  });
}

/**
 * Books a lesson the way a learner does in the app: through create_booking, signed in as them,
 * so every rule applies, credit included (PAY-04). Local only. Returns the lesson.
 */
export async function bookAsLearner(
  learnerEmail: string,
  instructorName: string,
  date: string,
  time: string,
  durationMinutes = 60,
): Promise<string> {
  return withDatabase(async (sql) =>
    sql.begin(async (tx) => {
      const [who] = await tx<{ learner_id: string; instructor_id: string; lesson_type_id: string }[]>`
        select learner.id as learner_id, p.id as instructor_id, t.id as lesson_type_id
          from public.instructor_profiles p
          join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
          join public.users learner on lower(learner.email) = lower(${learnerEmail})
         where p.display_name = ${instructorName}`;
      if (!who) throw new Error(`No ${instructorName}, or no ${learnerEmail}`);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: who.learner_id, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      const [booked] = await tx<{ id: string }[]>`
        select public.create_booking(${who.instructor_id}::uuid, ${who.learner_id}::uuid, ${who.lesson_type_id}::uuid,
                                     (${date}::date + ${time}::time) at time zone 'Europe/London', ${durationMinutes}::int)::text as id`;
      if (!booked) throw new Error('create_booking answered nothing');
      return booked.id;
    }),
  );
}

/** How a lesson was paid in person, if it was (PAY-05): the newest offline payment for it. */
export async function offlinePaymentOn(
  instructorName: string,
  date: string,
  time: string,
): Promise<{ method: string; status: string; amountPence: number } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ method: string; status: string; amount_pence: number }[]>`
      select p.method::text as method, p.status::text as status, p.amount_pence
        from public.payments p
        join public.bookings b on b.id = p.booking_id
        join public.instructor_profiles i on i.id = b.instructor_id
       where i.display_name = ${instructorName}
         and p.provider = 'offline'
         and b.starts_at = (${date}::date + ${time}::time) at time zone 'Europe/London'
       order by p.created_at desc
       limit 1`;
    const found = rows[0];
    return found ? { method: found.method, status: found.status, amountPence: found.amount_pence } : null;
  });
}

/** Somebody's user id, found by the email they signed up with. */
export async function userIdOf(email: string): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`select id from public.users where lower(email) = lower(${email})`;
    const found = rows[0];
    if (!found) throw new Error(`No user with the email ${email}`);
    return found.id;
  });
}

/** A lesson's id, by who teaches it and when it starts: the newest there, whatever became of it. */
export async function lessonIdAt(instructorName: string, date: string, time: string): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select b.id
        from public.bookings b
        join public.instructor_profiles p on p.id = b.instructor_id
       where p.display_name = ${instructorName}
         and b.starts_at = (${date}::date + ${time}::time) at time zone 'Europe/London'
       order by b.created_at desc
       limit 1`;
    const found = rows[0];
    if (!found) throw new Error(`No lesson for ${instructorName} at ${time} on ${date}`);
    return found.id;
  });
}

export interface OutboxEvent {
  name: string;
  payload: Record<string, unknown>;
}

/** The newest events of one name the database wrote about a lesson, as the job runner is sent them. */
export async function lessonEvents(bookingId: string, name: string): Promise<OutboxEvent[]> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ name: string; payload: Record<string, unknown> }[]>`
      select name, payload
        from public.outbox_events
       where name = ${name}
         and payload ->> 'booking_id' = ${bookingId}
       order by created_at desc`;
    return rows.map((row) => ({ name: row.name, payload: row.payload }));
  });
}

/** A place on an area's waiting list or a lesson request, as the database keeps it (MKT-10, M5-10). */
export interface CaptureEntry {
  id: string;
  token: string;
  consentWording: string;
  confirmationSentAt: string | null;
  removedAt: string | null;
}

export async function waitingListEntry(email: string): Promise<CaptureEntry | null> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ id: string; token: string; consent_wording: string; confirmation_sent_at: Date | null; left_at: Date | null }[]>`
      select id, token::text, consent_wording, confirmation_sent_at, left_at
        from public.area_waiting_list where lower(email) = lower(${email}) order by created_at desc limit 1`;
    return row
      ? {
          id: row.id,
          token: row.token,
          consentWording: row.consent_wording,
          confirmationSentAt: row.confirmation_sent_at?.toISOString() ?? null,
          removedAt: row.left_at?.toISOString() ?? null,
        }
      : null;
  });
}

export async function lessonRequestEntry(
  email: string,
): Promise<(CaptureEntry & { days: number[]; times: string[]; budgetPence: number | null; startWhen: string }) | null> {
  return withDatabase(async (sql) => {
    const [row] = await sql<
      {
        id: string;
        token: string;
        consent_wording: string;
        confirmation_sent_at: Date | null;
        withdrawn_at: Date | null;
        days: number[];
        times: string[];
        budget_pence: number | null;
        start_when: string;
      }[]
    >`
      select id, token::text, consent_wording, confirmation_sent_at, withdrawn_at, days, times, budget_pence, start_when
        from public.lesson_requests where lower(email) = lower(${email}) order by created_at desc limit 1`;
    return row
      ? {
          id: row.id,
          token: row.token,
          consentWording: row.consent_wording,
          confirmationSentAt: row.confirmation_sent_at?.toISOString() ?? null,
          removedAt: row.withdrawn_at?.toISOString() ?? null,
          days: row.days,
          times: row.times,
          budgetPence: row.budget_pence,
          startWhen: row.start_when,
        }
      : null;
  });
}

/** The event that asks for a capture's confirmation email, as the job runner would be sent it. */
export async function captureEvent(id: string): Promise<OutboxEvent | null> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ name: string; payload: Record<string, unknown> }[]>`
      select name, payload from public.outbox_events
       where name = 'learner_capture.created' and payload ->> 'id' = ${id}
       order by created_at desc limit 1`;
    return row ? { name: row.name, payload: row.payload } : null;
  });
}

export interface LessonMoney {
  paymentStatus: string;
  payments: { method: string; status: string; amountPence: number; refundedPence: number }[];
  refunds: { kind: string; status: string; amountPence: number }[];
}

/** Where a lesson's money stands: the lesson's word for it, its payments and its refunds (PAY-07, PAY-09). */
export async function lessonMoney(bookingId: string): Promise<LessonMoney> {
  return withDatabase(async (sql) => {
    const [lesson] = await sql<{ payment_status: string }[]>`
      select payment_status::text as payment_status from public.bookings where id = ${bookingId}`;
    const payments = await sql<{ method: string; status: string; amount_pence: number; refunded_pence: number }[]>`
      select method::text as method, status::text as status, amount_pence, refunded_pence
        from public.payments
       where booking_id = ${bookingId} and status in ('paid', 'refunded', 'partially_refunded')
       order by created_at`;
    const refunds = await sql<{ kind: string; status: string; amount_pence: number }[]>`
      select kind::text as kind, status::text as status, amount_pence
        from public.refunds
       where booking_id = ${bookingId}
       order by created_at`;
    return {
      paymentStatus: lesson?.payment_status ?? 'missing',
      payments: payments.map((one) => ({
        method: one.method,
        status: one.status,
        amountPence: one.amount_pence,
        refundedPence: one.refunded_pence,
      })),
      refunds: refunds.map((one) => ({ kind: one.kind, status: one.status, amountPence: one.amount_pence })),
    };
  });
}

/** The channels somebody's notification about something went out on, or null when there is none. */
export async function notificationChannels(email: string, kind: string, entityId: string): Promise<string[] | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ channels: string[] }[]>`
      select n.channels::text[] as channels
        from public.notifications n
        join public.users u on u.id = n.user_id
       where lower(u.email) = lower(${email})
         and n.kind = ${kind}
         and n.entity_id = ${entityId}::uuid
       order by n.created_at desc
       limit 1`;
    return rows[0]?.channels ?? null;
  });
}

/**
 * A lesson the learner called off late and has not paid the fee for (R-06, M3-18), as
 * cancel_booking leaves one. Written straight in, because a test cannot cancel a lesson two days
 * before without it being two days away. Local only. Returns the lesson.
 */
export async function lateFeeOwed(instructorName: string, learnerEmail: string, date: string, time: string, feePence = 4200): Promise<string> {
  await removeLesson(instructorName, learnerEmail, date, time);
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                   buffer_minutes, status, payment_mode, price_pence, source, cancelled_at,
                                   cancelled_by, late_cancellation, fee_pence)
      select p.business_id, p.id, u.id, t.id,
             (${date}::date + ${time}::time) at time zone 'Europe/London',
             (${date}::date + ${time}::time + interval '1 hour') at time zone 'Europe/London',
             30, 'cancelled', 'offline', 4200, 'instructor', now(), u.id, true, ${feePence}
        from public.instructor_profiles p
        join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
        join public.users u on lower(u.email) = lower(${learnerEmail})
       where p.display_name = ${instructorName}
      returning id`;
    const id = rows[0]?.id;
    if (!id) throw new Error(`Could not put a late cancellation in ${instructorName}'s diary`);
    return id;
  });
}

/**
 * Forgets that a Business keeps cards for a learner, so no fee is charged to a card with nobody
 * there (PAY-09, M3-19) and a test starts from nothing kept. Local only.
 */
export async function forgetKeptCards(learnerEmail: string, ownerEmail: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      delete from public.billing_customers bc
       using public.users learner, public.memberships m, public.users owner
       where learner.id = bc.learner_id
         and lower(learner.email) = lower(${learnerEmail})
         and m.business_id = bc.business_id
         and m.role = 'owner'
         and owner.id = m.user_id
         and lower(owner.email) = lower(${ownerEmail})`;
  });
}

/** The newest payment received for a lesson, for a test that has just paid for it. */
export async function paymentIdFor(bookingId: string): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select id from public.payments
       where booking_id = ${bookingId} and status in ('paid', 'partially_refunded', 'refunded')
       order by created_at desc
       limit 1`;
    const found = rows[0];
    if (!found) throw new Error(`No payment for lesson ${bookingId}`);
    return found.id;
  });
}

/** What a payment's receipt says, and whether it was emailed (PAY-08). Null before it is issued. */
export async function receiptFor(paymentId: string): Promise<{ number: number; vatPence: number | null; emailed: boolean } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ number: number; vat_pence: number | null; emailed_at: string | null }[]>`
      select number, vat_pence, emailed_at from public.receipts where payment_id = ${paymentId}`;
    const found = rows[0];
    return found ? { number: found.number, vatPence: found.vat_pence, emailed: found.emailed_at !== null } : null;
  });
}

/**
 * A notification, and whether it has gone out on its channels (M3-23). With Stripe the job runner
 * writes and sends it, a minute or two after the change, so a test waits on this.
 */
export async function notificationDelivery(email: string, kind: string, entityId: string): Promise<{ channels: string[]; sent: boolean } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ channels: string[]; sent: boolean }[]>`
      select n.channels::text[] as channels, n.sent_at is not null as sent
        from public.notifications n
        join public.users u on u.id = n.user_id
       where lower(u.email) = lower(${email})
         and n.kind = ${kind}
         and n.entity_id = ${entityId}::uuid
       order by n.created_at desc
       limit 1`;
    return rows[0] ?? null;
  });
}

/** The provider's id for the newest card payment for a lesson: how Stripe knows it (M3-23). */
export async function cardPaymentRefFor(bookingId: string): Promise<string> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ provider_ref: string | null }[]>`
      select provider_ref from public.payments
       where booking_id = ${bookingId} and method = 'card' and status in ('paid', 'partially_refunded', 'refunded')
       order by created_at desc
       limit 1`;
    const found = rows[0]?.provider_ref;
    if (!found) throw new Error(`No card payment for lesson ${bookingId}`);
    return found;
  });
}

/** The provider's id for the newest package a learner bought by card from the Business an owner runs (M3-23). */
export async function packagePaymentRef(learnerEmail: string, ownerEmail: string): Promise<string | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ provider_ref: string | null }[]>`
      select p.provider_ref
        from public.payments p
        join public.credit_lots l on l.payment_id = p.id
        join public.users learner on learner.id = p.learner_id
        join public.memberships m on m.business_id = p.business_id and m.role = 'owner'
        join public.users owner on owner.id = m.user_id
       where lower(learner.email) = lower(${learnerEmail})
         and lower(owner.email) = lower(${ownerEmail})
         and p.method = 'card'
       order by p.created_at desc
       limit 1`;
    return rows[0]?.provider_ref ?? null;
  });
}

/** The newest payment for a lesson whatever became of it, with the provider's id for it (M3-23). */
export async function newestPaymentFor(bookingId: string): Promise<{ status: string; amountPence: number; providerRef: string | null } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ status: string; amount_pence: number; provider_ref: string | null }[]>`
      select status::text as status, amount_pence, provider_ref
        from public.payments
       where booking_id = ${bookingId}
       order by created_at desc
       limit 1`;
    const found = rows[0];
    return found ? { status: found.status, amountPence: found.amount_pence, providerRef: found.provider_ref } : null;
  });
}

export interface RecordedLessonSeed {
  date: string;
  time: string;
  summary: string;
  /** Skill codes and their ratings: `{ DUALCW: 4 }`. */
  ratings: Record<string, number>;
  nextFocus?: string;
  homework?: string;
}

/**
 * Lessons that happened, each with its record, as an instructor saving them would leave them
 * (PRG-03, M4-06, M4-07). Written in the order given, so a test can have an older lesson's record
 * arrive after a newer one's. Marked paid, so they owe nobody anything. Whatever was at those
 * times is cleared first. Local only.
 */
export async function recordLessons(instructorName: string, learnerEmail: string, lessons: RecordedLessonSeed[]): Promise<void> {
  for (const lesson of lessons) await removeLesson(instructorName, learnerEmail, lesson.date, lesson.time);
  await withDatabase(async (sql) => {
    for (const lesson of lessons) {
      const [booking] = await sql<{ id: string; business_id: string; instructor_id: string; learner_id: string; starts_at: Date }[]>`
        insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                     buffer_minutes, status, payment_mode, payment_status, price_pence, source)
        select p.business_id, p.id, u.id, t.id,
               (${lesson.date}::date + ${lesson.time}::time) at time zone 'Europe/London',
               (${lesson.date}::date + ${lesson.time}::time + interval '1 hour') at time zone 'Europe/London',
               30, 'completed', 'offline', 'paid_cash', 4200, 'instructor'
          from public.instructor_profiles p
          join public.lesson_types t on t.business_id = p.business_id and t.name = 'Standard lesson'
          join public.users u on lower(u.email) = lower(${learnerEmail})
         where p.display_name = ${instructorName}
        returning id, business_id, instructor_id, learner_id, starts_at`;
      if (!booking) throw new Error(`No lesson made for ${instructorName} at ${lesson.time} on ${lesson.date}`);
      await sql`
        with record as (
          insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, lesson_starts_at,
                                             summary, next_focus, homework)
          values (gen_random_uuid(), ${booking.business_id}, ${booking.id}, ${booking.learner_id}, ${booking.instructor_id},
                  ${booking.starts_at}, ${lesson.summary}, ${lesson.nextFocus ?? null}, ${lesson.homework ?? null})
          returning id
        )
        insert into public.skill_ratings (lesson_record_id, skill_code, rating, business_id, learner_id)
        select record.id, rated.key, rated.value::smallint, ${booking.business_id}, ${booking.learner_id}
          from record, jsonb_each_text(${sql.json(lesson.ratings)}::jsonb) as rated`;
    }
  });
}

/** A lesson's record as saved, with its ratings and how long it took (PRG-01, M4-05). Null before one is saved. */
export async function lessonRecordFor(
  bookingId: string,
): Promise<{ summary: string; nextFocus: string | null; ratings: string[]; secondsTaken: number | null; lessonStatus: string } | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ summary: string; next_focus: string | null; ratings: string[]; seconds_taken: number | null; status: string }[]>`
      select r.summary, r.next_focus, r.seconds_taken, b.status::text as status,
             coalesce(array_agg(s.skill_code || ':' || s.rating order by s.skill_code) filter (where s.skill_code is not null), '{}') as ratings
        from public.lesson_records r
        join public.bookings b on b.id = r.booking_id
        left join public.skill_ratings s on s.lesson_record_id = r.id
       where r.booking_id = ${bookingId}
       group by r.id, b.status`;
    const found = rows[0];
    return found
      ? { summary: found.summary, nextFocus: found.next_focus, ratings: found.ratings, secondsTaken: found.seconds_taken, lessonStatus: found.status }
      : null;
  });
}

export interface MadeInstructor {
  slug: string;
  name: string;
  /** Signs in with the seed's password (supabase/seeds/test_helpers.sql). */
  email: string;
  remove: () => Promise<void>;
}

/** A postcode in the cache, as a lookup would have left it, for a base somewhere the seed has none. */
export interface CachedPostcode {
  postcode: string;
  latitude: number;
  longitude: number;
  district: string;
}

export async function cachePostcode(place: CachedPostcode): Promise<void> {
  const outcode = place.postcode.split(' ')[0] ?? '';
  await withDatabase(async (sql) => {
    await sql`
      insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
      values (${place.postcode}, ${outcode}, ${outcode.replace(/[0-9].*$/, '')}, ${place.latitude}, ${place.longitude}, ${place.district})
      on conflict (postcode) do nothing`;
  });
}

/**
 * A checked instructor with a Business of their own, made for one test and removed after it
 * (M5-06). Nothing else knows them, so a test can run their badge out without touching anybody
 * another test is using. Based in Leeds unless told otherwise, with a price, and a badge that runs
 * out on the day given.
 */
export async function makeInstructor(
  name: string,
  badgeExpiry: string,
  options: { postcode?: string; transmission?: 'manual' | 'automatic' | 'both' } = {},
): Promise<MadeInstructor> {
  const postcode = options.postcode ?? 'LS6 3QS';
  const transmission = options.transmission ?? 'manual';
  const userId = crypto.randomUUID();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${userId.slice(0, 8)}`;
  const email = `${slug}@example.com`;
  await withDatabase(async (sql) => {
    await sql`select tests.create_user_with_id(${userId}::uuid, ${email}, ${name})`;
    // A mobile they have verified, as every instructor has before their portal (AUTH-02): one of
    // the numbers set aside for drama, above the seed's, tried again if another test has it.
    for (let attempt = 0; ; attempt += 1) {
      const phone = `447700900${String(500 + Math.floor(Math.random() * 500))}`;
      try {
        await sql`update auth.users set phone = ${phone}, phone_confirmed_at = now() where id = ${userId}`;
        break;
      } catch (error) {
        if (attempt >= 5 || (error as { code?: string }).code !== '23505') throw error;
      }
    }
    const [business] = await sql<{ id: string }[]>`
      insert into public.businesses (type, name, slug, base_postcode)
      values ('independent', ${`${name} Driving`}, ${`${slug}-driving`}, ${postcode})
      returning id`;
    if (!business) throw new Error('No Business was made');
    await sql`insert into public.memberships (business_id, user_id, role) values (${business.id}, ${userId}, 'owner')`;
    await sql`
      insert into public.instructor_profiles (user_id, business_id, display_name, public_slug, verification_status, verified_at,
                                              badge_expiry, base_postcode, base_location, transmission, onboarding_completed_at)
      select ${userId}, ${business.id}, ${name}, ${slug}, 'approved', now(), ${badgeExpiry}::date, p.postcode, p.location,
             ${transmission}::public.transmission, now()
        from public.postcodes p
       where p.postcode = ${postcode}`;
    const [type] = await sql<{ id: string }[]>`
      insert into public.lesson_types (business_id, name) values (${business.id}, 'Standard lesson') returning id`;
    if (!type) throw new Error('No lesson type was made');
    await sql`
      insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
      values (${business.id}, ${type.id}, 60, 4000)`;
  });
  return {
    slug,
    name,
    email,
    remove: () =>
      withDatabase(async (sql) => {
        await sql`delete from public.businesses where slug = ${`${slug}-driving`}`;
        await sql`delete from auth.users where id = ${userId}`;
      }),
  };
}

export interface MembershipRow {
  business: string;
  role: string;
  /** Whether their instructor profile there is set up; null when they have none there. */
  onboarded: boolean | null;
}

/** Where somebody is a member, found by their email, and how far their profile there is set up (AUTH-05). */
export async function membershipsOf(email: string): Promise<MembershipRow[]> {
  return withDatabase(async (sql) => {
    const rows = await sql<MembershipRow[]>`
      select b.name as business, m.role::text as role,
             case when p.id is null then null else p.onboarding_completed_at is not null end as onboarded
        from public.memberships m
        join public.users u on u.id = m.user_id
        join public.businesses b on b.id = m.business_id
        left join public.instructor_profiles p on p.user_id = m.user_id and p.business_id = m.business_id
       where lower(u.email) = lower(${email}) and m.status = 'active'
       order by b.name`;
    return [...rows];
  });
}

export interface SchoolSetupRow {
  name: string;
  postcode: string | null;
  located: boolean;
  expectedInstructors: number | null;
  logoPath: string | null;
  onboarded: boolean;
}

/** What setting up a school saved, found by its owner's email (AUTH-05, M5-11). */
export async function schoolOwnedBy(email: string): Promise<SchoolSetupRow | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<SchoolSetupRow[]>`
      select b.name, b.base_postcode as postcode, b.base_location is not null as located,
             b.expected_instructors as "expectedInstructors", b.logo_url as "logoPath",
             b.onboarding_completed_at is not null as onboarded
        from public.businesses b
        join public.memberships m on m.business_id = b.id and m.role = 'owner'
        join public.users u on u.id = m.user_id
       where lower(u.email) = lower(${email}) and b.type = 'school'`;
    return rows[0] ?? null;
  });
}

/**
 * A link inviting somebody to teach for a seeded school, stored as the app stores one: only its
 * hash (D-064). For tests that need a link without setting a school up first.
 */
export async function schoolInvitationPath(schoolName: string): Promise<string> {
  const token = crypto.randomUUID().replaceAll('-', '');
  await withDatabase(async (sql) => {
    const made = await sql`
      insert into public.invitations (business_id, kind, role, channel, token_hash, invited_by)
      select b.id, 'member', 'instructor', 'link', private.invitation_hash(${token}), m.user_id
        from public.businesses b
        join public.memberships m on m.business_id = b.id and m.role = 'owner'
       where b.name = ${schoolName}`;
    if (made.count !== 1) throw new Error(`No school called ${schoolName} to invite anybody to`);
  });
  return `/invite/${token}`;
}

export interface OverviewFacts {
  lessons: { today: number; this_week: number };
  revenue_month: { lessons_pence: number; packages_pence: number; refunds_pence: number; total_pence: number };
  unpaid: { total_pence: number; count: number };
  utilisation: {
    open_minutes: number;
    booked_minutes: number;
    instructors: { instructor_id: string; name: string; open_minutes: number; booked_minutes: number }[];
  };
  new_learners_month: number;
}

export interface SeededSchoolFigures {
  /** What the overview's own function works out now. */
  facts: OverviewFacts;
  /** The same counts asked another way, by London calendar day, week and month. */
  lessonsToday: number;
  lessonsThisWeek: number;
  newLearnersThisMonth: number;
}

/** A school's overview figures as the database has them now, found by the school's name (SCH-01, M5-12). */
export async function seededSchoolFigures(schoolName: string): Promise<SeededSchoolFigures> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ facts: OverviewFacts; today: number; week: number; learners: number }[]>`
      with school as (select id from public.businesses where name = ${schoolName} and type = 'school')
      select private.school_overview_facts(s.id, now()) as facts,
             (select count(*)::int from public.bookings b
               where b.business_id = s.id
                 and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
                 and (b.starts_at at time zone 'Europe/London')::date = (now() at time zone 'Europe/London')::date) as today,
             (select count(*)::int from public.bookings b
               where b.business_id = s.id
                 and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
                 and date_trunc('week', b.starts_at at time zone 'Europe/London') = date_trunc('week', now() at time zone 'Europe/London')) as week,
             (select count(distinct r.learner_id)::int from public.learner_relationships r
               where r.business_id = s.id
                 and date_trunc('month', r.created_at at time zone 'Europe/London') = date_trunc('month', now() at time zone 'Europe/London')) as learners
        from school s`;
    if (!row) throw new Error(`No school called ${schoolName}`);
    return { facts: row.facts, lessonsToday: row.today, lessonsThisWeek: row.week, newLearnersThisMonth: row.learners };
  });
}

export interface PlatformFacts {
  from: string;
  signups: { learners: number; instructors: number; schools: number; undecided: number };
  businesses: { active: number; independent: number; schools: number; suspended: number; teaching: number };
  lessons: { booked: number; completed: number };
  money: { gmv_pence: number; card_pence: number; fees_pence: number; payments: number; refunds_pence: number };
  verification: { waiting: number; oldest: string | null };
  disputes: { open: number; oldest: string | null };
}

export interface PlatformFigures {
  /** What the dashboard's own function works out now. */
  facts: PlatformFacts;
  /** The same things counted plainly, in the same instant. */
  activeBusinesses: number;
  suspendedBusinesses: number;
  badgesWaiting: number;
  disputesOpen: number;
}

/** The admin dashboard's figures as the database has them now (ADM-01, M5-17). */
export async function platformFigures(): Promise<PlatformFigures> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ facts: PlatformFacts; active: number; suspended: number; badges: number; disputes: number }[]>`
      select private.platform_dashboard_facts(now()) as facts,
             (select count(*)::int from public.businesses where status = 'active') as active,
             (select count(*)::int from public.businesses where status = 'suspended') as suspended,
             (select count(*)::int from public.instructor_profiles where verification_status = 'pending') as badges,
             (select count(*)::int from public.no_show_disputes where decided_at is null) as disputes`;
    if (!row) throw new Error('The dashboard figures could not be read');
    return {
      facts: row.facts,
      activeBusinesses: row.active,
      suspendedBusinesses: row.suspended,
      badgesWaiting: row.badges,
      disputesOpen: row.disputes,
    };
  });
}

export interface MadeSchoolInstructor {
  name: string;
  /** Signs in with the seed's password (supabase/seeds/test_helpers.sql). */
  email: string;
  remove: () => Promise<void>;
}

/**
 * A checked instructor at a seeded school, made for one test and removed after it (M5-13), so a
 * test can switch somebody off without touching the instructors every other test books.
 */
export async function makeSchoolInstructor(
  name: string,
  schoolName = 'Quayside Driving School',
  options: { transmission?: 'manual' | 'automatic' | 'both'; postcode?: string; workingHours?: boolean } = {},
): Promise<MadeSchoolInstructor> {
  const userId = crypto.randomUUID();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${userId.slice(0, 8)}`;
  const email = `${slug}@example.com`;
  await withDatabase(async (sql) => {
    await sql`select tests.create_user_with_id(${userId}::uuid, ${email}, ${name})`;
    // A verified mobile, as every instructor has before their portal (AUTH-02), tried again if taken.
    for (let attempt = 0; ; attempt += 1) {
      const phone = `447700900${String(500 + Math.floor(Math.random() * 500))}`;
      try {
        await sql`update auth.users set phone = ${phone}, phone_confirmed_at = now() where id = ${userId}`;
        break;
      } catch (error) {
        if (attempt >= 5 || (error as { code?: string }).code !== '23505') throw error;
      }
    }
    const made = await sql`
      with school as (select id from public.businesses where name = ${schoolName} and type = 'school'),
           member as (insert into public.memberships (business_id, user_id, role) select id, ${userId}, 'instructor' from school returning business_id)
      insert into public.instructor_profiles (user_id, business_id, display_name, public_slug, verification_status, verified_at, onboarding_completed_at,
                                              transmission, base_postcode, base_location, is_listed)
      select ${userId}, business_id, ${name}, ${slug}, 'approved', now(), now(), ${options.transmission ?? 'manual'}::public.transmission,
             ${options.postcode ?? null}, (select location from public.postcodes where postcode = ${options.postcode ?? null}),
             -- Out of search, so the city pages and sitemaps other tests count stay as the seed has them.
             false
        from member`;
    if (made.count !== 1) throw new Error(`No school called ${schoolName} to add ${name} to`);
    // Open every day from seven till nine, so their free time outweighs anybody the seed has.
    if (options.workingHours) {
      await sql`
        insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
        select p.id, p.business_id, day, '07:00', '21:00'
          from public.instructor_profiles p, generate_series(1, 7) as day
         where p.user_id = ${userId}`;
    }
  });
  return {
    name,
    email,
    remove: () =>
      withDatabase(async (sql) => {
        await sql`delete from public.instructor_profiles where user_id = ${userId}`;
        await sql`delete from public.memberships where user_id = ${userId}`;
        await sql`delete from auth.users where id = ${userId}`;
      }),
  };
}

export interface SchoolMemberState {
  status: string;
  setOwnPrices: boolean;
  /** Their public address, which a member switched off does not have (D-120). */
  slug: string | null;
}

/** Where somebody stands at their school, found by their email (SCH-02). */
export async function schoolMemberState(email: string): Promise<SchoolMemberState | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<SchoolMemberState[]>`
      select m.status::text as status,
             coalesce(m.permissions -> 'set_own_prices' = 'true'::jsonb, false) as "setOwnPrices",
             p.public_slug as slug
        from public.memberships m
        join public.users u on u.id = m.user_id
        join public.businesses b on b.id = m.business_id and b.type = 'school'
        left join public.instructor_profiles p on p.user_id = m.user_id and p.business_id = m.business_id
       where lower(u.email) = lower(${email})`;
    return rows[0] ?? null;
  });
}

export interface MadeSchoolLearner {
  name: string;
  email: string;
  remove: () => Promise<void>;
}

/** A learner at a seeded school with nobody teaching them yet, made for one test and removed after it (M5-14). */
export async function makeSchoolLearner(
  name: string,
  options: { postcode: string; transmission: 'manual' | 'automatic' },
  schoolName = 'Quayside Driving School',
): Promise<MadeSchoolLearner> {
  const userId = crypto.randomUUID();
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.')}.${userId.slice(0, 8)}@example.com`;
  await withDatabase(async (sql) => {
    await sql`select tests.create_user_with_id(${userId}::uuid, ${email}, ${name})`;
    await sql`
      insert into public.learner_profiles (user_id, postcode, location, transmission)
      select ${userId}, p.postcode, p.location, ${options.transmission}::public.learner_transmission
        from public.postcodes p
       where p.postcode = ${options.postcode}`;
    const made = await sql`
      insert into public.learner_relationships (business_id, learner_id, source, created_by)
      select b.id, ${userId}, 'manual', ${userId} from public.businesses b where b.name = ${schoolName} and b.type = 'school'`;
    if (made.count !== 1) throw new Error(`No school called ${schoolName} to add ${name} to`);
  });
  return {
    name,
    email,
    remove: () =>
      withDatabase(async (sql) => {
        await sql`delete from public.learner_relationships where learner_id = ${userId}`;
        await sql`delete from public.learner_profiles where user_id = ${userId}`;
        await sql`delete from auth.users where id = ${userId}`;
      }),
  };
}

/** Who teaches a learner at a seeded school now, by their name (LRN-06). */
export async function learnerTeacherAtSchool(email: string, schoolName = 'Quayside Driving School'): Promise<string | null> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ display_name: string | null }[]>`
      select p.display_name
        from public.learner_relationships r
        join public.users u on u.id = r.learner_id
        join public.businesses b on b.id = r.business_id and b.name = ${schoolName}
        left join public.instructor_profiles p on p.id = r.instructor_id
       where lower(u.email) = lower(${email})`;
    return rows[0]?.display_name ?? null;
  });
}

export interface MadeSchool {
  businessId: string;
  name: string;
  /** Signs in with the seed's password; a manager needs no second step. */
  managerEmail: string;
  instructor: { name: string; email: string; slug: string };
  remove: () => Promise<void>;
}

/**
 * A school of a test's own (M5-15): a manager, one checked instructor with a booking link, and an
 * hour's lesson at £40. Nothing else knows it, so a test can change its prices and rules without
 * touching the seeded school that the payment tests charge at known prices.
 */
export async function makeSchool(label: string): Promise<MadeSchool> {
  const businessId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const instructorId = crypto.randomUUID();
  const typeId = crypto.randomUUID();
  const key = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${businessId.slice(0, 8)}`;
  const name = `${label} School`;
  const managerEmail = `manager.${key}@example.com`;
  const instructor = { name: `Ines ${label}`, email: `instructor.${key}@example.com`, slug: `ines-${key}` };

  await withDatabase(async (sql) => {
    await sql`select tests.create_user_with_id(${managerId}::uuid, ${managerEmail}, ${`Mo ${label}`})`;
    await sql`select tests.create_user_with_id(${instructorId}::uuid, ${instructor.email}, ${instructor.name})`;
    for (let attempt = 0; ; attempt += 1) {
      const phone = `447700900${String(500 + Math.floor(Math.random() * 500))}`;
      try {
        await sql`update auth.users set phone = ${phone}, phone_confirmed_at = now() where id = ${instructorId}`;
        break;
      } catch (error) {
        if (attempt >= 5 || (error as { code?: string }).code !== '23505') throw error;
      }
    }
    await sql`
      insert into public.businesses (id, type, name, slug, base_postcode, onboarding_completed_at)
      values (${businessId}, 'school', ${name}, ${key}, 'M1 2QF', now())`;
    await sql`
      insert into public.memberships (business_id, user_id, role)
      values (${businessId}, ${managerId}, 'manager'), (${businessId}, ${instructorId}, 'instructor')`;
    await sql`
      insert into public.instructor_profiles (user_id, business_id, display_name, public_slug, verification_status, verified_at,
                                              onboarding_completed_at, base_postcode, base_location, is_listed)
      -- Out of search, so Manchester's city page and the sitemaps other tests count stay as the seed has them;
      -- the booking link works all the same (PUB-04).
      select ${instructorId}, ${businessId}, ${instructor.name}, ${instructor.slug}, 'approved', now(), now(), p.postcode, p.location, false
        from public.postcodes p where p.postcode = 'M1 2QF'`;
    await sql`insert into public.lesson_types (id, business_id, name) values (${typeId}, ${businessId}, 'Standard lesson')`;
    await sql`
      insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
      values (${businessId}, ${typeId}, 60, 4000)`;
  });

  return {
    businessId,
    name,
    managerEmail,
    instructor,
    remove: () =>
      withDatabase(async (sql) => {
        await sql`delete from public.businesses where id = ${businessId}`;
        await sql`delete from auth.users where id in (${managerId}, ${instructorId})`;
      }),
  };
}

export interface MadeTakings {
  gmvPence: number;
  cardPence: number;
  feesPence: number;
  refundsPence: number;
  remove: () => Promise<void>;
}

/**
 * Money taken just now at a school of a test's own (M5-17): £42 by card with a 50p platform fee,
 * £380 in cash, and £10 of the card payment given back. The seed takes no money, and nothing else
 * reads this school, so the platform's takings move without changing what the payment tests count.
 */
export async function makeTakings(label: string): Promise<MadeTakings> {
  const school = await makeSchool(label);
  const learnerId = crypto.randomUUID();
  const key = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${learnerId.slice(0, 8)}`;

  await withDatabase(async (sql) => {
    await sql`select tests.create_user_with_id(${learnerId}::uuid, ${`learner.${key}@example.com`}, ${`Lara ${label}`})`;
    const [card] = await sql<{ id: string }[]>`
      insert into public.payments (business_id, learner_id, provider, amount_pence, fee_pence, method, status, paid_at)
      values (${school.businessId}, ${learnerId}, 'stripe', 4200, 50, 'card', 'paid', now())
      returning id`;
    if (!card) throw new Error('The card payment was not written');
    await sql`
      insert into public.payments (business_id, learner_id, provider, amount_pence, method, status, paid_at)
      values (${school.businessId}, ${learnerId}, 'offline', 38000, 'cash', 'paid', now())`;
    await sql`
      insert into public.refunds (business_id, payment_id, learner_id, kind, amount_pence, reason, status, settled_at)
      values (${school.businessId}, ${card.id}, ${learnerId}, 'card', 1000, 'Cut short', 'succeeded', now())`;
  });

  return {
    gmvPence: 42200,
    cardPence: 4200,
    feesPence: 50,
    refundsPence: 1000,
    remove: async () => {
      await school.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where id = ${learnerId}`;
      });
    },
  };
}

/** A school's own booking rules as saved, found by its name (SCH-04). */
export async function schoolRules(schoolName: string): Promise<Record<string, unknown>> {
  return withDatabase(async (sql) => {
    const rows = await sql<{ settings: Record<string, unknown> }[]>`select settings from public.businesses where name = ${schoolName}`;
    return rows[0]?.settings ?? {};
  });
}
