import { ClipboardList, CreditCard } from 'lucide-react';
import { icons } from '@/lib/icons';
import { installAppLink, MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function LearnerAccountPage() {
  return (
    <MoreMenu
      title="Account"
      links={[
        await notificationsMenuLink(),
        { href: '/app/learner/account/pickup-points', icon: icons.pickupPoints, title: 'Pickup points', subtitle: 'Where your lessons start, and which one is usual' },
        { href: '/app/learner/account/about-you', icon: ClipboardList, title: 'About you', subtitle: 'What helps your instructor plan your lessons' },
        { href: '/app/learner/payments', icon: CreditCard, title: 'Payments', subtitle: 'Lesson credit, packages and saved cards' },
        { href: '/feedback', icon: icons.feedback, title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', icon: icons.account, title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
