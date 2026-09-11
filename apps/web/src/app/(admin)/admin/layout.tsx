import { AppShell } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { PortalGate } from '@/components/portal-gate';
import { PortalSidebar } from '@/components/portal-nav';
import { SidebarFooter } from '@/components/sidebar-footer';

/** Super Admin is desktop only (PRD 8.2) and needs TOTP (AUTH-08). */
// Gated by the session: the shell is instant, the content may block on the gate (D-029).
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="admin" footer={<SidebarFooter />} />}>
      <div className="md:hidden">
        <EmptyState icon={Monitor} title="Use a larger screen" description="The admin portal works on a laptop or desktop." />
      </div>
      <div className="hidden md:block">
        <PortalGate portal="admin">{children}</PortalGate>
      </div>
    </AppShell>
  );
}
