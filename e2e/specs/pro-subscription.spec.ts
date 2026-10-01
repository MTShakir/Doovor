import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { holdPlanBusiness, withDatabase } from '../support/database';
import { expectAccessible, settled, snap, tapUntil } from '../support/helpers';

/**
 * Taking Pro and stopping it (9.18, D-231, D-235).
 *
 * The fake billing provider stands in for Stripe. It sends the browser to `/dev/subscribe`
 * instead of Stripe's page, which finishes the checkout and puts the events that follow through
 * the real webhook handler. So everything here is the real path apart from the card form: the
 * signature is checked, the event is recorded exactly once, and the plan changes because an event
 * said so rather than because a page was visited.
 *
 * The seeded instructor is on Pro, and other files read that, so every test here puts the
 * Business back the way it found it. `@desktop-only` so the two widths do not both move it, and
 * a lock so the file that checks what Free carries does not move it at the same moment.
 */
test.describe('Pro, paid for through the platform (9.18, D-231)', { tag: '@desktop-only' }, () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: authFile('instructor') });

  let release: (() => Promise<void>) | null = null;
  let seeded: { plan: string; expires: string | null } = { plan: 'pro', expires: null };

  /** Sarah Khan's Business, found by the instructor who owns it. */
  const businessId = async (): Promise<string> =>
    withDatabase(async (sql) => {
      const [row] = await sql<{ id: string }[]>`
        select b.id from public.businesses b
          join public.memberships m on m.business_id = b.id
          join public.users u on u.id = m.user_id
         where u.email = 'sarah.khan@example.com' and m.role = 'owner' and b.type = 'independent'`;
      if (!row) throw new Error('The seeded instructor owns no independent Business');
      return row.id;
    });

  /** Free, with nothing subscribed and nothing banked: where a new instructor starts. */
  const onFree = async (business: string): Promise<void> => {
    await withDatabase(async (sql) => {
      await sql`delete from public.subscriptions where business_id = ${business}`;
      await sql`delete from public.provider_events where event_id like 'evt_sub%' or event_id like 'evt_in%'`;
      await sql`update public.businesses set plan = 'free', plan_expires_at = null where id = ${business}`;
      await sql`delete from public.referrals where code = 'E2EPRO'`;
      await sql`update public.referrals set earned_at = null where referrer_business_id = ${business}`;
    });
  };

  /**
   * Back to exactly what was found, so every other file reads what it expects. The day the plan
   * runs to is put back as it was rather than cleared: another file reads that date, and
   * subscribing writes its own renewal date over it.
   */
  const asFound = async (business: string): Promise<void> => {
    await withDatabase(async (sql) => {
      await sql`delete from public.subscriptions where business_id = ${business}`;
      await sql`delete from public.provider_events where event_id like 'evt_sub%' or event_id like 'evt_in%'`;
      await sql`update public.businesses set plan = ${seeded.plan}, plan_expires_at = ${seeded.expires}
                 where id = ${business}`;
      await sql`delete from public.referrals where code = 'E2EPRO'`;
      await sql`update public.referrals set earned_at = null, reward_applied_at = null
                 where referrer_business_id = ${business}`;
    });
  };

  test.beforeAll(async () => {
    release = await holdPlanBusiness();
    const business = await businessId();
    seeded = await withDatabase(async (sql) => {
      const [row] = await sql<{ plan: string; plan_expires_at: string | null }[]>`
        select plan, plan_expires_at from public.businesses where id = ${business}`;
      return { plan: row?.plan ?? 'pro', expires: row?.plan_expires_at ?? null };
    });
  });

  test.afterAll(async () => {
    await asFound(await businessId());
    await release?.();
    release = null;
  });

  const subscription = (page: Page) => page.getByRole('region', { name: 'Your subscription' });

  test('an instructor subscribes, and the plan changes because an event said so', async ({ page }, testInfo) => {
    const business = await businessId();
    await onFree(business);

    await page.goto('/app/instructor/plan');
    const offer = page.getByRole('region', { name: 'Go Pro' });
    await expect(offer).toBeVisible();

    // Both choices are priced, and the yearly one says what it saves.
    await expect(offer.getByText('£12', { exact: true })).toBeVisible();
    await expect(offer.getByText('£120', { exact: true })).toBeVisible();
    await expect(offer.getByText('Save £24')).toBeVisible();
    // Yearly is the one chosen to begin with, so the notice it promises is a fortnight and a text.
    await expect(offer.getByText(/14 days before each renewal, and text you too/)).toBeVisible();

    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'go-pro');

    // Monthly says three days and no text.
    await offer.getByRole('radio', { name: /Monthly/ }).check();
    await expect(offer.getByText(/3 days before each renewal/)).toBeVisible();
    await expect(offer.getByText(/text you too/)).toHaveCount(0);

    // Back to yearly, and take it. The fake sends the browser through /dev/subscribe, which is
    // where the webhook happens, and it lands back here.
    await offer.getByRole('radio', { name: /Yearly/ }).check();
    await tapUntil(offer.getByRole('button', { name: 'Go Pro' }), subscription(page));

    await expect(subscription(page)).toContainText('Pro renews every year');
    await expect(page.getByRole('region', { name: 'Go Pro' })).toHaveCount(0);
    // The plan card must not call a plan somebody is paying for "Free until", on the very day
    // they are next charged (D-231).
    const plan = page.getByRole('region', { name: 'Pro', exact: true });
    await expect(plan).toContainText('Paid up to');
    await expect(plan.getByText(/Free until/)).toHaveCount(0);

    const after = await withDatabase(async (sql) => {
      const [row] = await sql<{ plan: string; months_paid: number }[]>`
        select b.plan, s.months_paid from public.businesses b
          join public.subscriptions s on s.business_id = b.id
         where b.id = ${business}`;
      return row;
    });
    expect(after?.plan).toBe('pro');
    // A year is twelve months of the loyalty run, counted from the interval on the row.
    expect(Number(after?.months_paid)).toBe(12);

    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'pro-subscribed');
  });

  test('stopping lets it run out rather than ending it now, and can be undone', async ({ page }, testInfo) => {
    const business = await businessId();
    await onFree(business);

    await page.goto('/app/instructor/plan');
    await tapUntil(
      page.getByRole('region', { name: 'Go Pro' }).getByRole('button', { name: 'Go Pro' }),
      subscription(page),
    );

    // Clicked once, not with `tapUntil`: this is a toggle, so a second tap would undo it and the
    // test would pass or fail on how fast the runner was.
    const mine = subscription(page);
    await mine.getByRole('button', { name: 'Stop renewing' }).click();
    await expect(mine.getByRole('button', { name: 'Keep Pro' })).toBeVisible({ timeout: 15_000 });
    await expect(mine.getByText('Ending')).toBeVisible();

    // Still Pro: what has been paid for runs out first (CAN-06).
    const plan = await withDatabase(async (sql) => {
      const [row] = await sql<{ plan: string }[]>`select plan from public.businesses where id = ${business}`;
      return row?.plan;
    });
    expect(plan).toBe('pro');

    await settled(page);
    await snap(page, testInfo, 'pro-ending');

    await mine.getByRole('button', { name: 'Keep Pro' }).click();
    await expect(mine.getByRole('button', { name: 'Stop renewing' })).toBeVisible({ timeout: 15_000 });
    await expect(mine.getByText('Ending')).toHaveCount(0);
  });

  test('a referral month earned comes off the first payment, and is spent by it (D-205)', async ({ page }) => {
    const business = await businessId();
    await onFree(business);

    // A referral this Business has earned a month from, made here rather than hoped for in the
    // seed: the school stands in for the instructor who was referred and approved. Staff
    // approving somebody is what sets `earned_at`, which this does directly (D-231).
    const referral = await withDatabase(async (sql) => {
      const [school] = await sql<{ id: string }[]>`
        select id from public.businesses where type = 'school' limit 1`;
      if (!school) throw new Error('the seed has no school to stand in for a referred Business');
      const [row] = await sql<{ id: string }[]>`
        insert into public.referrals (code, referrer_business_id, referred_business_id, reward_months, earned_at)
        values ('E2EPRO', ${business}, ${school.id}, 1, now())
        returning id`;
      return row?.id ?? '';
    });

    await page.goto('/app/instructor/plan');
    const offer = page.getByRole('region', { name: 'Go Pro' });
    await expect(offer.getByText(/earned by referring people/)).toContainText(
      'comes off this first payment before your card is used',
    );

    await tapUntil(offer.getByRole('button', { name: 'Go Pro' }), subscription(page));

    const spent = await withDatabase(async (sql) => {
      const [row] = await sql<{ reward_applied_at: string | null }[]>`
        select reward_applied_at from public.referrals where id = ${referral}`;
      return row?.reward_applied_at;
    });
    expect(spent, 'the month was spent by the invoice that used it').not.toBeNull();

    await withDatabase(async (sql) => sql`delete from public.referrals where id = ${referral}`);
  });

  test('back from the card page before the event lands, nobody is asked to pay twice', async ({ page }, testInfo) => {
    const business = await businessId();
    await onFree(business);

    // The address Stripe sends somebody back to, reached before the event that grants Pro. With
    // the fake that gap is nothing, so it is walked into directly: this is the state, not the way
    // it is usually arrived at.
    await page.goto('/app/instructor/plan?subscribed=1');

    const waiting = page.getByRole('region', { name: 'Setting up your subscription' });
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('You do not need to pay again.');
    // The button that would take a second payment is not on the page at all.
    await expect(page.getByRole('button', { name: 'Go Pro' })).toHaveCount(0);
    await expect(waiting.getByRole('button', { name: 'Check again' })).toBeVisible();

    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'subscription-waiting');
  });

  test('a school owner is offered nothing, because a school pays per instructor', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    await page.goto('/app/school/plan');

    await expect(page.getByRole('heading', { level: 1, name: 'Your plan' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Go Pro' })).toHaveCount(0);
    await expect(subscription(page)).toHaveCount(0);
    await context.close();
  });
});

/**
 * The seeded state: an instructor given Pro by a founding place, with nothing paying for it yet.
 *
 * It touches nothing, so it runs at both widths. It still takes the lock, because reading a
 * Business while the file above is moving it between plans reads whichever half it is in.
 */
test.describe('Pro that nothing is paying for yet (D-203, D-231)', () => {
  test.use({ storageState: authFile('instructor') });

  let release: (() => Promise<void>) | null = null;

  test.beforeAll(async () => {
    release = await holdPlanBusiness();
  });

  test.afterAll(async () => {
    await release?.();
    release = null;
  });

  test('is offered the one that carries on, not the one they already have', async ({ page }, testInfo) => {
    await page.goto('/app/instructor/plan');

    // "Go Pro" at somebody who has Pro is wrong, and hiding the card leaves them no way to keep it.
    const keep = page.getByRole('region', { name: 'Keep Pro' });
    await expect(keep).toBeVisible();
    await expect(page.getByRole('region', { name: 'Go Pro' })).toHaveCount(0);
    await expect(keep).toContainText('Set up a payment now and it carries on from there');
    await expect(keep.getByRole('button', { name: 'Keep Pro' })).toBeVisible();

    // Both prices are there to choose between, at either width.
    await expect(keep.getByRole('radio', { name: /Monthly/ })).toBeVisible();
    await expect(keep.getByRole('radio', { name: /Yearly/ })).toBeVisible();

    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'keep-pro');
  });
});
