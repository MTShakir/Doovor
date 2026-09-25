import { installAppLink, MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function InstructorMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/instructor/profile', title: 'Profile', subtitle: 'Your public profile and booking link' },
        { href: '/app/instructor/money/setup', title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' },
        { href: '/app/instructor/books', title: 'Bookkeeping', subtitle: 'Expenses, mileage and your tax year' },
        { href: '/app/instructor/plan', title: 'Your plan', subtitle: 'What you are on, and until when' },
        { href: '/app/instructor/refer', title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
        { href: '/feedback', title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/app/instructor/settings', title: 'Settings', subtitle: 'Booking rules and working hours' },
        await notificationsMenuLink(),
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
