import { Bell } from 'lucide-react';
import type { ComponentProps, ElementType } from 'react';
import { cn } from '../lib/cn';

type LinkLike = ElementType<ComponentProps<'a'>>;

/** What the badge says: nothing while nothing is waiting, the number up to nine, then "9+". */
export function unreadBadge(unread: number | null): string | null {
  if (unread === null || unread <= 0) return null;
  return unread > 9 ? '9+' : String(unread);
}

/** What a screen reader hears: the exact number, which the badge rounds. */
export function unreadLabel(unread: number | null): string {
  return unread === null || unread <= 0 ? 'Notifications' : `Notifications, ${String(unread)} unread`;
}

/**
 * The way to what somebody has been told, from every screen (NTF-01, D-159): top right on a
 * phone, and at the top of the menu from the md breakpoint. A red count says how many are
 * waiting. Until the count is known the bell shows on its own, so the screen never waits for it.
 */
export function NotificationBell({
  href,
  unread,
  linkComponent: Link = 'a',
}: {
  href: string;
  /** How many are unread, or null while that is not known yet. */
  unread: number | null;
  /** The app's link component (for example Next.js Link). The UI package cannot import it. */
  linkComponent?: LinkLike;
}) {
  const badge = unreadBadge(unread);
  return (
    <Link
      href={href}
      aria-label={unreadLabel(unread)}
      className={cn(
        'relative flex size-12 shrink-0 items-center justify-center rounded-full text-black transition-colors duration-200 hover:bg-grey-100',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black',
      )}
    >
      <Bell size={24} strokeWidth={1.5} aria-hidden />
      {badge ? (
        <span
          aria-hidden
          className="absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red px-1 text-caption font-semibold text-white tabular-nums ring-2 ring-white"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
