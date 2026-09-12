import { EmptyState } from '@repo/ui/empty-state';
import { PageHeader } from '@repo/ui/app-shell';
import { Construction } from 'lucide-react';
import { notFound } from 'next/navigation';
import { labelFor, sectionsFor, type Portal } from '@/lib/navigation';

/** Milestone that delivers each Phase 1 section (docs/PLAN.md). */
const arrivesIn: Record<Portal, Record<string, string>> = {
  learner: { '': 'M2', lessons: 'M2', progress: 'M4', payments: 'M3' },
  instructor: { money: 'M3' },
  school: { '': 'M5', instructors: 'M5', learners: 'M2', money: 'M3', settings: 'M5' },
  admin: {
    '': 'M5',
    businesses: 'M5',
    instructors: 'M5',
    learners: 'M5',
    bookings: 'M5',
    payments: 'M5',
    regions: 'M5',
    settings: 'M5',
    'audit-log': 'M5',
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
