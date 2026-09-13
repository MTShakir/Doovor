import { MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function InstructorMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/instructor/profile', title: 'Profile', subtitle: 'Your public profile and booking link' },
        { href: '/app/instructor/settings', title: 'Settings', subtitle: 'Booking rules and working hours' },
        await notificationsMenuLink(),
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
      ]}
    />
  );
}
