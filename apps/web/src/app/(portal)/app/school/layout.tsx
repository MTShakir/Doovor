import { AppShell } from '@repo/ui/app-shell';
import type { ReactNode } from 'react';
import { PortalSidebar, PortalTabBar } from '@/components/portal-nav';

export default function SchoolLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="school" />} tabBar={<PortalTabBar portal="school" />}>
      {children}
    </AppShell>
  );
}
