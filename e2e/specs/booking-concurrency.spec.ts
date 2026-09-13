import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { databaseUrl, withDatabase } from '../support/database';

/**
 * Acceptance test 2 (PRD 17.2, BOK-07, R-02): two learners take the same slot at the same
 * moment, and exactly one of them gets it.
 *
 * This one talks to the database rather than the browser, because the thing being proved is
 * what happens when two transactions are open at once, which no amount of clicking can show.
 * The constraint does the work: the second insert waits for the first to commit and is then
 * refused by the exclusion on the instructor's time.
 */
test.describe('two learners, one slot (BOK-07, R-02)', () => {
  test('acceptance-02: exactly one of them gets it', async () => {
    // A week of its own for each width, because both widths race at the same moment.
    const weeks = test.info().project.name === 'mobile' ? 3 : 4;
    const facts = await withDatabase(async (sql) => {
      const [instructor] = await sql<{ id: string; business_id: string }[]>`
        select id, business_id from public.instructor_profiles where display_name = 'Sarah Khan'`;
      const [lessonType] = await sql<{ id: string }[]>`
        select id from public.lesson_types
         where business_id = ${instructor?.business_id ?? ''} and name = 'Standard lesson'`;
      const learners = await sql<{ id: string }[]>`
        select u.id from public.users u
         where u.email in ('jack.taylor@example.com', 'olivia.brown@example.com')
         order by u.email`;
      // A few weeks ahead: inside the eight week horizon, past the fortnight the seed fills,
      // and at ten in the morning on a Wednesday, when Sarah is open.
      const [slot] = await sql<{ starts_at: Date }[]>`
        select (date_trunc('week', now() + make_interval(weeks => ${weeks}))
                  + interval '2 days' + interval '10 hours')
                 at time zone 'Europe/London' as starts_at`;
      return {
        instructorId: instructor?.id ?? '',
        lessonTypeId: lessonType?.id ?? '',
        learnerIds: learners.map((one) => one.id),
        startsAt: slot?.starts_at ?? new Date(),
      };
    });

    expect(facts.learnerIds).toHaveLength(2);

    // However the last run ended, this one starts with that moment free.
    await withDatabase(async (sql) => {
      await sql`delete from public.bookings where instructor_id = ${facts.instructorId} and starts_at = ${facts.startsAt}::timestamptz`;
    });

    /** One learner, in their own transaction, booking the slot. */
    const book = async (learnerId: string) => {
      const sql = postgres(databaseUrl, { max: 1 });
      try {
        return await sql.begin(async (tx) => {
          await tx`select tests.authenticate_as(${learnerId}::uuid)`;
          // Both transactions are open before either commits, which is the race itself.
          await tx`select pg_sleep(0.2)`;
          const rows = await tx<{ create_booking: string }[]>`
            select public.create_booking(
              ${facts.instructorId}::uuid, ${learnerId}::uuid, ${facts.lessonTypeId}::uuid,
              ${facts.startsAt}::timestamptz, 60)`;
          return rows[0]?.create_booking ?? null;
        });
      } finally {
        await sql.end();
      }
    };

    const results = await Promise.allSettled(facts.learnerIds.map((id) => book(id)));
    const won = results.filter((result) => result.status === 'fulfilled');
    const lost = results.filter((result) => result.status === 'rejected');

    expect(won, 'one booking succeeded').toHaveLength(1);
    expect(lost, 'the other was refused').toHaveLength(1);
    const refusal = lost[0]?.status === 'rejected' ? String(lost[0].reason) : '';
    expect(refusal, 'and was told the slot had just gone').toContain('SLOT_TAKEN');

    // And the diary has exactly one lesson at that moment.
    const held = await withDatabase(async (sql) => {
      const rows = await sql<{ count: number }[]>`
        select count(*)::int as count from public.bookings
         where instructor_id = ${facts.instructorId} and starts_at = ${facts.startsAt}::timestamptz
           and status in ('requested', 'pending_payment', 'confirmed', 'in_progress', 'completed')`;
      return rows[0]?.count ?? 0;
    });
    expect(held).toBe(1);

    await withDatabase(async (sql) => {
      await sql`delete from public.bookings where instructor_id = ${facts.instructorId} and starts_at = ${facts.startsAt}::timestamptz`;
    });
  });
});
