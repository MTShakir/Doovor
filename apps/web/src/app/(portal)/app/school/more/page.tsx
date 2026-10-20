import { Images, Layers, PoundSterling, Settings, UserPlus, Wallet } from 'lucide-react';
import { icons } from '@/lib/icons';
import { installAppLink, MoreMenu } from '@/components/more-menu';

/**
 * The school's More menu, in the same order as the instructor's (D-209): the money, then the
 * settings, then the account. Notifications is not here: the bell is in the header of every
 * screen. A school is on the School plan, so nothing here is locked.
 */
export default function SchoolMorePage() {
  return (
    <MoreMenu
      title="More"
      links={[
        { href: '/app/school/pupils', icon: UserPlus, title: 'New pupils', subtitle: 'People who asked for lessons' },
        { href: '/app/school/money', icon: PoundSterling, title: 'Money', subtitle: 'Payments and revenue' },
        { href: '/app/school/money/pay', icon: Wallet, title: 'Instructor pay', subtitle: 'What each instructor taught, and their pay' },
        { href: '/app/school/money/setup', icon: icons.paymentSetup, title: 'Payment setup', subtitle: 'Card payments, how learners pay, receipts' },
        { href: '/app/school/books', icon: icons.bookkeeping, title: 'Bookkeeping', subtitle: 'On the way for schools' },
        { href: '/app/school/gallery', icon: Images, title: 'Gallery', subtitle: 'Photos from the day somebody passes' },
        { href: '/app/school/settings', icon: Settings, title: 'Settings', subtitle: 'Prices, packages and booking rules' },
        { href: '/app/school/plan', icon: Layers, title: 'Your plan', subtitle: 'What you are on, and until when' },
        { href: '/app/school/refer', icon: icons.refer, title: 'Refer an instructor', subtitle: 'A month free for every one who joins' },
        { href: '/feedback', icon: icons.feedback, title: 'Tell us something', subtitle: 'A request, a problem, or anything else' },
        { href: '/account', icon: icons.account, title: 'Account and security', subtitle: 'Password, devices, two-step verification' },
        installAppLink,
      ]}
    />
  );
}
