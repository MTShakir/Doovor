import { MoreMenu } from '@/components/more-menu';

export default function InstructorMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/instructor/profile', title: 'Profile', subtitle: 'Your public profile and booking link' },
        { href: '/app/instructor/settings', title: 'Settings', subtitle: 'Booking rules and working hours' },
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
      ]}
    />
  );
}
