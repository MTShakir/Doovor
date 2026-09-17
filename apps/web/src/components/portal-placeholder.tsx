import { EmptyState } from '@repo/ui/empty-state';
import { PageHeader } from '@repo/ui/app-shell';
import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';
import { labelFor, sectionsFor, type Portal } from '@/lib/navigation';

/** Milestone that delivers each Phase 1 section (docs/PLAN.md). */
const arrivesIn: Record<Portal, Record<string, string>> = {
  learner: { '': 'M2', payments: 'M3' },
  instructor: {},
  school: {},
  admin: {
    bookings: 'M5',
    payments: 'M5',
  },
};

/** Sections still waiting for their milestone. Sections with real pages are left out. */
export function sectionParams(portal: Portal) {
  return sectionsFor(portal)
    .filter((section) => section in arrivesIn[portal])
    .map((section) => ({ section }));
}

export function PortalPlaceholder({ portal, section }: { portal: Portal; section: string }) {
  const milestone = arrivesIn[portal][section];
  if (milestone === undefined) notFound();
  return (
    <main>
      <PageHeader title={labelFor(portal, section)} />
      <EmptyState
        icon={Construction}
        title="This screen is on its way"
        description={`It arrives in milestone ${milestone} of the Phase 1 plan.`}
      />
    </main>
  );
}
