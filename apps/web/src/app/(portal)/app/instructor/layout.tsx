import { AppShell } from '@repo/ui/app-shell';
import type { ReactNode } from 'react';
import { PortalSidebar, PortalTabBar } from '@/components/portal-nav';

export default function InstructorLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="instructor" />} tabBar={<PortalTabBar portal="instructor" />}>
      {children}
    </AppShell>
  );
}
