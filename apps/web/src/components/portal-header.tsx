import { brand } from '@repo/config/brand';
import { MobileTopBar } from '@repo/ui/app-shell';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getSession } from '@/lib/auth/session';
import { PortalNotificationBell } from '@/components/notification-bell';
import { SupportButton } from '@/components/support-button';

/**
 * What sits at the top right of a portal, on a phone and on a desktop (D-159, D-241): support,
 * then the bell.
 *
 * Support is to the left of the bell on purpose. The bell is where somebody looks for what has
 * happened to them, and a rightmost thing is the one a thumb reaches first on a phone: the one
 * people press by habit should stay where it has always been.
 */

async function Support() {
  // Who is signed in, which a prerendered shell cannot know. Pictures are uploaded into that
  // person's own folder, so the form cannot be drawn without it.
  await connection();
  const session = await getSession();
  if (session === null) return null;
  return <SupportButton userId={session.userId} />;
}

export function PortalHeaderActions() {
  return (
    <div className="flex items-center gap-0.5">
      {/* No fallback: a button that cannot do anything yet is worse than one that arrives a
          moment late beside a bell that is already there. */}
      <Suspense fallback={null}>
        <Support />
      </Suspense>
      <PortalNotificationBell />
    </div>
  );
}

/** The phone's top bar in a portal: the name, then support and the bell (D-159, D-241). */
export function PortalTopBar() {
  return <MobileTopBar title={brand.name} actions={<PortalHeaderActions />} />;
}
