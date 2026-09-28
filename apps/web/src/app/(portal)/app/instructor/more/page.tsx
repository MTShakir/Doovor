import { hasEntitlement } from '@repo/config/plans';
import {
  CalendarSync,
  Gift,
  Images,
  Layers,
  MessageCircle,
  MessageSquarePlus,
  Palette,
  Receipt,
  Settings,
  ShieldCheck,
  UserRound,
  CreditCard,
} from 'lucide-react';
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
        { href: '/app/instructor/profile', icon: UserRound, title: 'Profile', subtitle: 'Your public profile and booking link' },
        { href: '/app/instructor/settings', icon: Settings, title: 'Settings', subtitle: 'Booking rules and working hours' },
        { href: '/app/instructor/money/setup', icon: CreditCard, title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' },
        { href: '/app/instructor/messages', icon: MessageCircle, title: 'Messages', subtitle: 'In-app chat with your learners, on the way' },
        {
          href: '/app/instructor/books',
          icon: Receipt,
          title: 'Bookkeeping',
          subtitle: 'Expenses, mileage and your year',
          pro: true,
          locked,
        },
        { href: '/app/instructor/calendar', icon: CalendarSync, title: 'Calendar sync', subtitle: 'On the way', pro: true, locked },
        {
          href: '/app/instructor/gallery',
          icon: Images,
          title: 'Gallery',
          subtitle: 'The photo you take when somebody passes',
          pro: true,
          locked,
        },
        { href: '/app/instructor/colours', icon: Palette, title: 'Your booking colours', subtitle: 'Your colour on your booking page', pro: true, locked },
        { href: '/app/instructor/plan', icon: Layers, title: 'Your plan', subtitle: 'What you are on, and until when' },
        { href: '/app/instructor/refer', icon: Gift, title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
        { href: '/feedback', icon: MessageSquarePlus, title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', icon: ShieldCheck, title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
