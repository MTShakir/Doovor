import { AppShell } from '@repo/ui/app-shell';
import type { ReactNode } from 'react';
import { PortalSidebar, PortalTabBar } from '@/components/portal-nav';

export default function LearnerLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="learner" />} tabBar={<PortalTabBar portal="learner" />}>
      {children}
    </AppShell>
  );
}
