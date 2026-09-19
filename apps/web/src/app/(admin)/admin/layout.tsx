import { AppShell } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { EmptyState } from '@repo/ui/empty-state';
import { Monitor } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { PortalNotificationBell } from '@/components/notification-bell';
import { PortalGate } from '@/components/portal-gate';
import { PortalSidebar } from '@/components/portal-nav';
import { ForgetKeptScreens } from '@/components/pwa/forget-kept-screens';
import { SidebarFooter } from '@/components/sidebar-footer';
import { portalsBesidesAdmin } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';

/** Super Admin is desktop only (PRD 8.2) and needs TOTP (AUTH-08). */
// Gated by the session: the shell is instant, the content may block on the gate (D-029).
export const instant = false;

/** Staff who are also a school, an instructor or a learner carry on there from a phone (PRD 8.2). */
async function ElsewhereOnAPhone() {
  const { access } = await requireAccess();
  const portals = portalsBesidesAdmin(access);
  if (portals.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-2">
      {portals.map(({ href, label }, index) => (
        <Button key={href} asChild width="full" variant={index === 0 ? 'primary' : 'secondary'}>
          <Link href={href as Route}>{label}</Link>
        </Button>
      ))}
    </div>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="admin" footer={<SidebarFooter />} headerAction={<PortalNotificationBell />} />}>
      {/* Back from viewing as somebody, anything their screens left on this device goes (ADM-06, D-129). */}
      <ForgetKeptScreens />
      <div className="md:hidden">
        <EmptyState
          icon={Monitor}
          title="Use a larger screen"
          description="The admin portal works on a laptop or desktop."
          action={
            <Suspense fallback={null}>
              <ElsewhereOnAPhone />
            </Suspense>
          }
        />
      </div>
      <div className="hidden md:block">
        <PortalGate portal="admin">{children}</PortalGate>
      </div>
    </AppShell>
  );
}
