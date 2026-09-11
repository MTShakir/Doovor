import { MoreMenu } from '@/components/more-menu';

export default function SchoolMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/school/money', title: 'Money', subtitle: 'Payments and revenue' },
        { href: '/app/school/settings', title: 'Settings', subtitle: 'Prices, packages and booking rules' },
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
      ]}
    />
  );
}
