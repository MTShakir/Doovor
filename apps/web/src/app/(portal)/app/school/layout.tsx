import { AppShell } from '@repo/ui/app-shell';
import type { ReactNode } from 'react';
import { PortalGate } from '@/components/portal-gate';
import { PortalSidebar, PortalTabBar } from '@/components/portal-nav';
import { OfflineSupport } from '@/components/pwa/offline-support';
import { SidebarFooter } from '@/components/sidebar-footer';

// Gated by the session: the shell is instant, the content may block on the gate (D-029).
export const instant = false;

export default function SchoolLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="school" footer={<SidebarFooter />} />} tabBar={<PortalTabBar portal="school" />}>
      <PortalGate portal="school">{children}</PortalGate>
      <OfflineSupport />
    </AppShell>
  );
}
