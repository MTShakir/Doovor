import { brand } from '@repo/config/brand';
import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { linkFromEmail } from '../support/mailpit';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/**
 * Telling another instructor about it (D-205), and what staying is worth (D-206).
 *
 * The reward lands when billing starts, which it has not, so what is checked here is the part
 * that works today: the link exists, it carries a code, and somebody who came from it is shown
 * with what they earned still waiting.
 */
test.describe('refer an instructor (D-205)', () => {
  test.use({ storageState: authFile('instructor') });

  test('an instructor finds their link, and sees who came from it and what it earned', async ({ page }, testInfo) => {
    // Both widths run against the same seeded instructor, so each brings a Business of its own
    // name and looks only for that one (e2e/support/database.ts, the shared-data rule).
    const name = `Referred ${testInfo.project.name} Driving`;
    // A Business referred by the seeded instructor, made for this test and taken away after it.
    const made = await withDatabase(async (sql) => {
      const [instructor] = await sql<{ id: string; code: string }[]>`
        select b.id, b.referral_code as code
          from public.businesses b
          join public.memberships m on m.business_id = b.id
          join public.users u on u.id = m.user_id
         where u.email = 'sarah.khan@example.com' and m.role = 'owner'`;
      if (!instructor) throw new Error('The seeded instructor owns no Business');
      const [joined] = await sql<{ id: string }[]>`
        insert into public.businesses (type, name, slug, base_postcode)
        values ('independent', ${name}, ${`referred-${Date.now().toString(36)}`}, 'M1 2QF')
        returning id`;
      if (!joined) throw new Error('The referred Business was not written');
      await sql`
        insert into public.referrals (referrer_business_id, referred_business_id, code)
        values (${instructor.id}, ${joined.id}, ${instructor.code})`;
      return { code: instructor.code, joinedId: joined.id };
    });

    try {
      await page.goto('/app/instructor/refer');
      await expect(page.getByRole('heading', { level: 1, name: 'Refer an instructor' })).toBeVisible();

      const link = page.getByRole('region', { name: 'Your link' });
      await expect(link.getByLabel('Link')).toHaveValue(new RegExp(`/start[?]ref=${made.code}$`));
      await expect(link).toContainText(`Your code is ${made.code}.`);
      await expect(link.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
        'href',
        new RegExp(`^https://wa[.]me/[?]text=.*${encodeURIComponent(brand.name)}`),
      );

      const joined = page.getByRole('region', { name: 'Who has joined' });
      const mine = joined.getByRole('listitem').filter({ hasText: name });
      await expect(mine).toHaveCount(1);
      await expect(mine).toContainText('a month waiting');
      await expect(joined).toContainText('come off your first bill');

      await expectAccessible(page);
      await snap(page, testInfo, 'refer-an-instructor');
    } finally {
      await withDatabase(async (sql) => sql`delete from public.businesses where id = ${made.joinedId}`);
    }
  });

  test('the plan screen says what staying is worth, in the numbers the rule uses', async ({ page }) => {
    await page.goto('/app/instructor/plan');
    const loyalty = page.getByRole('region', { name: 'Staying costs less' });
    await expect(loyalty).toContainText('every 3 months takes another 5% off');
    await expect(loyalty).toContainText('up to 30% after 18 months');
    await expect(loyalty).toContainText('Leaving puts it back to nothing.');
  });
});

/**
 * The whole of it, once: a link opened by a stranger, an account made from it, and the referral
 * recorded against whoever shared it. The code rides in a cookie through the sign-up and the email
 * confirmation, so nothing short of this proves it survives them.
 */
test.describe('arriving on a referral link (D-205)', () => {
  test('somebody who signs up from a referral link is recorded against whoever shared it', async ({ page }, testInfo) => {
    const code = await withDatabase(async (sql) => {
      const [row] = await sql<{ code: string }[]>`
        select b.referral_code as code
          from public.businesses b
          join public.memberships m on m.business_id = b.id
          join public.users u on u.id = m.user_id
         where u.email = 'sarah.khan@example.com' and m.role = 'owner'`;
      if (!row) throw new Error('The seeded instructor owns no Business');
      return row.code;
    });

    const email = uniqueEmail(testInfo, 'referred');
    try {
      // The link points at the first screen, as the one an instructor shares does.
      await page.goto(`/start?ref=${code}`);
      await chooseRoleAndCreateAccount(
        page,
        { card: "I'm an instructor", heading: 'Create your instructor account' },
        { fullName: 'Ivy Referred', email },
      );
      await page.goto(await linkFromEmail(email, 'Confirm your email'));
      // Their Business is made on the way to verifying their mobile, referral and all.
      await expect(page).toHaveURL(/\/verify-phone/);

      const recorded = await withDatabase(
        async (sql) => sql<{ code: string; referrer: string }[]>`
          select r.code, referrer.name as referrer
            from public.referrals r
            join public.businesses referrer on referrer.id = r.referrer_business_id
            join public.businesses referred on referred.id = r.referred_business_id
            join public.memberships m on m.business_id = referred.id and m.role = 'owner'
            join public.users u on u.id = m.user_id
           where u.email = ${email}`,
      );
      expect(recorded).toEqual([{ code, referrer: 'Sarah Khan Driving' }]);
    } finally {
      // The Business goes first: it records who made it, and that will not let them go while
      // it is there. Its membership, its profile and the referral go with it.
      await withDatabase(async (sql) => {
        await sql`
          delete from public.businesses
           where created_by = (select id from public.users where email = ${email})`;
        await sql`delete from auth.users where email = ${email}`;
      });
    }
  });
});
