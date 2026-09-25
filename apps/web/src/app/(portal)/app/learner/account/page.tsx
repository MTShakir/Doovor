import { installAppLink, MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function LearnerAccountPage() {
  return (
    <MoreMenu
      title="Account"
      links={[
        await notificationsMenuLink(),
        { href: '/app/learner/account/pickup-points', title: 'Pickup points', subtitle: 'Where your lessons start, and which one is usual' },
        { href: '/app/learner/account/about-you', title: 'About you', subtitle: 'What helps your instructor plan your lessons' },
        { href: '/app/learner/payments', title: 'Payments', subtitle: 'Lesson credit, packages and saved cards' },
        { href: '/feedback', title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
