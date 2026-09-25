import { installAppLink, MoreMenu } from '@/components/more-menu';
import { notificationsMenuLink } from '@/lib/notifications/inbox';

export default async function SchoolMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/school/money', title: 'Money', subtitle: 'Payments and revenue' },
        { href: '/app/school/money/setup', title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' },
        { href: '/app/school/books', title: 'Bookkeeping', subtitle: 'Coming soon' },
        { href: '/app/school/plan', title: 'Your plan', subtitle: 'What you are on, and until when' },
        { href: '/app/school/refer', title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
        { href: '/feedback', title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/app/school/settings', title: 'Settings', subtitle: 'Prices, packages and booking rules' },
        await notificationsMenuLink(),
        { href: '/account', title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
