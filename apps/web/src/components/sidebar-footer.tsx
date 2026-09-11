import { LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';

/** Desktop sidebar footer: account and sign out. */
export function SidebarFooter() {
  const item =
    'flex h-12 w-full items-center gap-3 rounded-full px-3 text-body text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black';
  return (
    <div className="flex flex-col gap-1">
      <Link href="/account" className={item}>
        <UserRound size={24} strokeWidth={1.5} aria-hidden />
        Account and security
      </Link>
      <form action={signOut.bind(null, 'local')}>
        <button type="submit" className={item}>
          <LogOut size={24} strokeWidth={1.5} aria-hidden />
          Sign out
        </button>
      </form>
    </div>
  );
}
