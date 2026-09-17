'use client';

import { LearnerResults } from '@/components/admin/people';
import type { AdminLearnerRow } from '@/lib/admin/people';
import { usePersonPanel } from '../use-person-panel';

/** ADM-02: the learners found, each opening their panel. */
export function LearnersScreen({
  rows,
  query,
  viewer,
}: {
  rows: AdminLearnerRow[];
  query: string;
  viewer: { canManage: boolean; userId: string };
}) {
  const person = usePersonPanel(viewer);
  return (
    <>
      <LearnerResults rows={rows} query={query} onOpen={person.open} />
      {person.panel}
    </>
  );
}
