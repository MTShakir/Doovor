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
