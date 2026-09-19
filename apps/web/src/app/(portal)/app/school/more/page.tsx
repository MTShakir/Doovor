import { installAppLink, MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function SchoolMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/school/money', title: 'Money', subtitle: 'Payments and revenue' },
        { href: '/app/school/settings', title: 'Settings', subtitle: 'Prices, packages and booking rules' },
        await notificationsMenuLink(),
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
