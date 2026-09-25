import { hasEntitlement } from '@repo/config/plans';
import { installAppLink, MoreMenu } from '@/components/more-menu';
import { businessPlanKey } from '@/lib/billing/plan';

/**
 * The More menu, in the order somebody reaches for things (D-209): what learners see first, then
 * the money, then the Pro extras still on their way, then the account.
 *
 * Notifications is not here. The bell is in the header of every screen, so a second way in from a
 * menu was one more row between somebody and the thing they came for.
 *
 * Pro rows are here on every plan. Somebody on Free sees them greyed with the tag, and the screen
 * they open says what the feature is and offers the plan: a feature nobody can see is a feature
 * nobody buys.
 */
export default async function InstructorMorePage() {
  const plan = await businessPlanKey();
  const locked = plan === null || !hasEntitlement(plan, 'expensesAndExports');

  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/instructor/profile', title: 'Profile', subtitle: 'Your public profile and booking link' },
        { href: '/app/instructor/settings', title: 'Settings', subtitle: 'Booking rules and working hours' },
        { href: '/app/instructor/money/setup', title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' },
        {
          href: '/app/instructor/books',
          title: 'Bookkeeping',
          subtitle: 'Expenses, mileage and your year',
          pro: true,
          locked,
        },
        { href: '/app/instructor/calendar', title: 'Calendar sync', subtitle: 'On the way', pro: true, locked },
        { href: '/app/instructor/colours', title: 'Your booking colours', subtitle: 'On the way', pro: true, locked },
        { href: '/app/instructor/plan', title: 'Your plan', subtitle: 'What you are on, and until when' },
        { href: '/app/instructor/refer', title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
        { href: '/feedback', title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
