import { EmptyState } from '@repo/ui/empty-state';
import { PageHeader } from '@repo/ui/app-shell';
import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';
import { labelFor, sectionsFor, type Portal } from '@/lib/navigation';

/** What each Phase 1 section still without its screen says about it (docs/PLAN.md). */
const waiting: Record<Portal, Record<string, string>> = {
  learner: {
    '': 'It arrives in milestone M2 of the Phase 1 plan.',
    payments: 'It arrives in milestone M3 of the Phase 1 plan.',
  },
  instructor: {},
  school: {},
  // Bookings and Payments were the last of PRD 8.2's admin menu without screens (D-133). Payments
  // has one now, and Bookings is gone: lessons are looked into through the person (D-174).
  admin: {},
};

/** Sections still waiting for their milestone. Sections with real pages are left out. */
export function sectionParams(portal: Portal) {
  return sectionsFor(portal)
    .filter((section) => section in waiting[portal])
    .map((section) => ({ section }));
}

export function PortalPlaceholder({ portal, section }: { portal: Portal; section: string }) {
  const description = waiting[portal][section];
  if (description === undefined) notFound();
  return (
    <main>
      <PageHeader title={labelFor(portal, section)} />
      <EmptyState
        icon={Construction}
        title="This screen is on its way"
        description={description}
      />
    </main>
  );
}
