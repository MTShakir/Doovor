import { AppShell } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';
import { PortalSidebar } from '@/components/portal-nav';

/** Super Admin is desktop only (PRD 8.2). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell sidebar={<PortalSidebar portal="admin" />}>
      <div className="md:hidden">
        <EmptyState
          icon={Monitor}
          title="Use a larger screen"
          description="The admin portal works on a laptop or desktop."
        />
      </div>
      <div className="hidden md:block">{children}</div>
    </AppShell>
  );
}
