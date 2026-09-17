import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { authFile, roles, type RoleKey } from '../support/accounts';
import { bookLesson, makeSchool, makeSchoolLearner, removeLesson, withDatabase } from '../support/database';
import { setting } from '../support/settings';

/** A local day, however the machine running the tests is set. */
const londonDay = (inDays: number): string => {
  const day = new Date();
  day.setDate(day.getDate() + inDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
};

interface Answer {
  status: number;
  body: unknown;
}

/** A learner asked for by id, at the Business they learn with. */
interface Asking {
  learnerId: string;
  businessId: string;
}

/** One way in through the API for a learner's id, and what not found looks like through it. */
interface Door {
  name: string;
  ask: (asking: Asking) => Promise<Answer>;
  notFound: (answer: Answer) => boolean;
}

async function answerOf(response: { status: () => number; text: () => Promise<string> }): Promise<Answer> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON, which no door here should answer; the comparison shows it as it came.
  }
  return { status: response.status(), body };
}

const field = (body: unknown, key: string): unknown =>
  typeof body === 'object' && body !== null && key in body ? (body as Record<string, unknown>)[key] : undefined;

/**
 * A signed-in person's session, as the app's own cookies carry it (@supabase/ssr): one cookie, or
 * several numbered parts of one, holding the session as base64 JSON. The portal is opened first, so
 * a session that has run out since the sign-in was saved is renewed as it would be for them.
 */
async function signedIn(context: BrowserContext, role: RoleKey): Promise<string> {
  const page = await context.newPage();
  await page.goto(roles[role].landing);
  await expect(page.getByRole('heading', { level: 1, name: roles[role].heading })).toBeVisible();
  await page.close();
  const parts = (await context.cookies())
    .map((cookie) => ({ value: cookie.value, part: /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/.exec(cookie.name) }))
    .filter((cookie) => cookie.part !== null)
    .sort((a, b) => Number(a.part?.[1] ?? 0) - Number(b.part?.[1] ?? 0));
  const session = JSON.parse(
    Buffer.from(parts.map((part) => part.value).join('').replace(/^base64-/, ''), 'base64url').toString('utf8'),
  ) as { access_token?: unknown };
  if (typeof session.access_token !== 'string') throw new Error(`No session saved for ${role}`);
  return session.access_token;
}

/**
 * Every way the API takes a learner's id: the database's own API, which the app's pages and a phone
 * app read through with the person's session, and the app's own /api/v1.
 */
function doorsFor(request: APIRequestContext, app: APIRequestContext, token: string): Door[] {
  const supabaseUrl = setting('NEXT_PUBLIC_SUPABASE_URL');
  // Only ever the stack on this machine: this test asks for people it should not see.
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(supabaseUrl)) {
    throw new Error('acceptance-07 talks to the local Supabase stack only. Point NEXT_PUBLIC_SUPABASE_URL in .env.local at it.');
  }
  const headers = { apikey: setting('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), authorization: `Bearer ${token}` };

  // A row asked for as one object is PostgREST's not found: 406, no rows.
  const row = (table: string, column: string): Door => ({
    name: `${table} by ${column}`,
    ask: async ({ learnerId }) =>
      answerOf(
        await request.get(`${supabaseUrl}/rest/v1/${table}?${column}=eq.${learnerId}&select=*`, {
          headers: { ...headers, accept: 'application/vnd.pgrst.object+json' },
        }),
      ),
    notFound: (answer) => answer.status === 406 && field(answer.body, 'code') === 'PGRST116',
  });
  const rpc = (name: string, args: (asking: Asking) => Record<string, string>): Door => ({
    name: `${name}()`,
    ask: async (asking) => answerOf(await request.post(`${supabaseUrl}/rest/v1/rpc/${name}`, { headers, data: args(asking) })),
    notFound: (answer) => field(answer.body, 'message') === 'NOT_FOUND',
  });

  return [
    row('users', 'id'),
    row('learner_profiles', 'user_id'),
    row('learner_private', 'user_id'),
    row('learner_relationships', 'learner_id'),
    row('learner_card', 'learner_id'),
    row('learner_list', 'learner_id'),
    row('learner_notes', 'learner_id'),
    row('pickup_points', 'learner_id'),
    row('bookings', 'learner_id'),
    row('booking_recurrences', 'learner_id'),
    row('lesson_records', 'learner_id'),
    row('skill_ratings', 'learner_id'),
    row('skill_progress', 'learner_id'),
    row('credit_accounts', 'learner_id'),
    row('credit_lots', 'learner_id'),
    row('credit_ledger', 'learner_id'),
    row('payments', 'learner_id'),
    row('refunds', 'learner_id'),
    row('receipts', 'learner_id'),
    row('billing_customers', 'learner_id'),
    row('no_show_disputes', 'learner_id'),
    row('notification_preferences', 'user_id'),
    row('notifications', 'user_id'),
    row('push_subscriptions', 'user_id'),
    row('deletion_requests', 'user_id'),
    row('account_suspensions', 'user_id'),
    rpc('learner_history', ({ learnerId }) => ({ p_learner_id: learnerId })),
    rpc('learner_balance', ({ learnerId, businessId }) => ({ p_business_id: businessId, p_learner_id: learnerId })),
    {
      name: 'GET /api/v1/lesson-records',
      ask: async ({ learnerId }) => answerOf(await app.get(`/api/v1/lesson-records?learner=${learnerId}`)),
      notFound: (answer) => answer.status === 404 && field(answer.body, 'code') === 'NOT_FOUND',
    },
  ];
}

/**
 * Acceptance test 7 (PRD 17.2, NFR-SEC-01, M5-23): a user from Business A asks the API for Business
 * B's learner by id, and the answer is not found.
 *
 * Business B is a school of the test's own with a learner who has a lesson booked, so there is
 * something to find. Two people from other Businesses ask for her through every door the API has:
 * the owner of the seeded school, past her second step, and an independent instructor. Each door must
 * answer not found, and exactly as it answers for an id that belongs to nobody, so the answer does not
 * even say she exists. The same doors find a learner of the owner's own school, so a door that could
 * never find anybody cannot pass for one that refuses.
 */
test.describe('another Business learner (NFR-SEC-01, M5-23)', { tag: '@desktop-only' }, () => {
  test('acceptance-07: a user from Business A asks the API for Business B learner by id, and the answer is not found', async ({ browser, request }) => {
    const bravo = await makeSchool('Bravo');
    const theirs = await makeSchoolLearner('Bea Bravo', { postcode: 'M1 2QF', transmission: 'manual' }, bravo.name);
    const own = await makeSchoolLearner('Olive Own', { postcode: 'M15 4FN', transmission: 'automatic' });
    // Seven weeks out at dawn, a time no other test books.
    const day = londonDay(49);
    await bookLesson(bravo.instructor.name, theirs.email, day, '06:15');
    const ids = await withDatabase(async (sql) => {
      const rows = await sql<{ email: string; id: string }[]>`
        select lower(email) as email, id from public.users where lower(email) in (${theirs.email.toLowerCase()}, ${own.email.toLowerCase()})`;
      const [school] = await sql<{ id: string }[]>`select id from public.businesses where name = 'Quayside Driving School'`;
      const idOf = (email: string) => rows.find((row) => row.email === email.toLowerCase())?.id ?? '';
      return { theirs: idOf(theirs.email), own: idOf(own.email), school: school?.id ?? '' };
    });
    expect(Object.values(ids).every((id) => id !== '')).toBe(true);

    // The owner finds a learner of her own school through the same doors; Sarah has none of the test's own.
    const askers: { role: RoleKey; own: Asking | null }[] = [
      { role: 'schoolOwner', own: { learnerId: ids.own, businessId: ids.school } },
      { role: 'instructor', own: null },
    ];
    try {
      for (const asker of askers) {
        const context = await browser.newContext({ storageState: authFile(asker.role) });
        try {
          const token = await signedIn(context, asker.role);
          const doors = doorsFor(request, context.request, token);
          for (const door of doors) {
            const answer = await door.ask({ learnerId: ids.theirs, businessId: bravo.businessId });
            const nobodys = await door.ask({ learnerId: crypto.randomUUID(), businessId: bravo.businessId });
            expect.soft(door.notFound(answer), `${roles[asker.role].email}: ${door.name} answers not found, not ${JSON.stringify(answer)}`).toBe(true);
            expect.soft(answer, `${roles[asker.role].email}: ${door.name} answers as it does for nobody`).toEqual(nobodys);
          }

          const own = asker.own;
          if (own !== null) {
            for (const door of doors.filter((one) => ['users by id', 'learner_card by learner_id', 'learner_history()', 'learner_balance()', 'GET /api/v1/lesson-records'].includes(one.name))) {
              const answer = await door.ask(own);
              expect.soft(answer.status, `${door.name} finds a learner of the school's own`).toBe(200);
            }
          }
        } finally {
          await context.close();
        }
      }
    } finally {
      await removeLesson(bravo.instructor.name, theirs.email, day, '06:15');
      await theirs.remove();
      await own.remove();
      await bravo.remove();
    }
  });
});
