import { brand } from '@repo/config/brand';
import { MobileTopBar } from '@repo/ui/app-shell';
import { NotificationBell } from '@repo/ui/notification-bell';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { unreadCount } from '@/lib/notifications/inbox';
import { NavLink } from './nav-link';

const inbox = '/notifications';

async function BellWithCount() {
  // One person's own count, which a prerendered shell cannot know.
  await connection();
  return <NotificationBell href={inbox} unread={await unreadCount()} linkComponent={NavLink} />;
}

/**
 * The way to somebody's notifications from every screen, with how many are waiting (NTF-01,
 * D-159). The bell is in the shell at once; the count streams in behind it (D-029).
 */
export function PortalNotificationBell() {
  return (
    <Suspense fallback={<NotificationBell href={inbox} unread={null} linkComponent={NavLink} />}>
      <BellWithCount />
    </Suspense>
  );
}

/** The phone's top bar in a portal: the name, and the bell at the top right (D-159). */
export function PortalTopBar() {
  return <MobileTopBar title={brand.name} actions={<PortalNotificationBell />} />;
}
