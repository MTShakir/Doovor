import { MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function LearnerAccountPage() {
  return (
    <MoreMenu
      title="Account"
      links={[
        await notificationsMenuLink(),
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
      ]}
    />
  );
}
