import type { Metadata } from 'next';
import { hasEntitlement } from '@repo/config/plans';
import {
  CalendarSync,
  Images,
  Layers,
  Palette,
  Settings,
  UserRound,
  Wallet,
} from 'lucide-react';
import { icons } from '@/lib/icons';
import { installAppLink, MoreMenu } from '@/components/more-menu';
import { businessPlanKey } from '@/lib/billing/plan';
import { galleryIsOpen } from '@/lib/gallery/mine';
import { requirePortal } from '@/lib/auth/session';
import { ownSchoolLink } from '@/lib/school/link';

export const metadata: Metadata = { title: 'More' };

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
  const [plan, linked, { access }, galleryOpen] = await Promise.all([
    businessPlanKey(),
    ownSchoolLink(),
    requirePortal('instructor'),
    galleryIsOpen(),
  ]);
  // An instructor teaching under a school sees what it pays them (D-291).
  const teachesForSchool = access.memberships.some((one) => one.businessType === 'school' && one.role === 'instructor');
  const locked = plan === null || !hasEntitlement(plan, 'expensesAndExports');
  // The school takes the payments, keeps the books, chooses the colours and pays for the plan, so
  // somebody teaching under it is not offered rows that only open a screen saying so (D-396).
  const ownBusiness = !teachesForSchool;

  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/instructor/profile', icon: UserRound, title: 'Profile', subtitle: 'Your public profile and booking link' },
        // Only for an instructor whose own business is linked to a school (D-282).
        ...(linked ? [{ href: '/app/instructor/school' as const, icon: icons.school, title: 'Your school', subtitle: linked.link.schoolName }] : []),
        ...(teachesForSchool ? [{ href: '/app/instructor/pay' as const, icon: Wallet, title: 'Your pay', subtitle: 'What you taught each week, and your pay' }] : []),
        { href: '/app/instructor/settings', icon: Settings, title: 'Settings', subtitle: 'Booking rules and working hours' },
        ...(ownBusiness
          ? [{ href: '/app/instructor/money/setup' as const, icon: icons.paymentSetup, title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' }]
          : []),
        { href: '/app/instructor/messages', icon: icons.messages, title: 'Messages', subtitle: 'In-app chat with your learners, on the way' },
        ...(ownBusiness
          ? [
              {
                href: '/app/instructor/books' as const,
                icon: icons.bookkeeping,
                title: 'Bookkeeping',
                subtitle: 'Expenses, mileage and your year',
                pro: true,
                locked,
              },
            ]
          : []),
        { href: '/app/instructor/calendar', icon: CalendarSync, title: 'Calendar sync', subtitle: 'On the way', pro: ownBusiness, locked: ownBusiness && locked },
        {
          href: '/app/instructor/gallery',
          icon: Images,
          title: 'Gallery',
          subtitle: 'The photo you take when somebody passes',
          pro: ownBusiness,
          // Open to an instructor at a school on the School plan, whose plan is not theirs to read (D-374).
          locked: !galleryOpen,
        },
        ...(ownBusiness
          ? [
              { href: '/app/instructor/colours' as const, icon: Palette, title: 'Your booking colours', subtitle: 'Your colour on your booking page', pro: true, locked },
              { href: '/app/instructor/plan' as const, icon: Layers, title: 'Your plan', subtitle: 'What you are on, and until when' },
              { href: '/app/instructor/refer' as const, icon: icons.refer, title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
            ]
          : []),
        { href: '/feedback', icon: icons.feedback, title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', icon: icons.account, title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
