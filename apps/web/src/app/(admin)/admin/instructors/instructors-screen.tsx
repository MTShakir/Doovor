'use client';

import { InstructorResults } from '@/components/admin/people';
import type { AdminInstructorRow } from '@/lib/admin/people';
import { usePersonPanel } from '../use-person-panel';

/** ADM-02: the instructors found, each opening their panel. */
export function InstructorsScreen({
  rows,
  query,
  viewer,
}: {
  rows: AdminInstructorRow[];
  query: string;
  viewer: { canManage: boolean; userId: string };
}) {
  const person = usePersonPanel(viewer);
  return (
    <>
      <InstructorResults rows={rows} query={query} onOpen={person.open} />
      {person.panel}
    </>
  );
}
