'use client';

import { learnerStatusLabels, lessonsTakenLine } from '@repo/core/learners';
import { formatDateTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import Link from 'next/link';
import { useRef, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { AllocationChoices, type AllocationState } from '@/components/school/allocation-choices';
import type { LearnerRow } from '@/lib/learners/list';
import { statusPill } from '@/lib/learners/status-pill';
import { assignLearner, suggestInstructors } from './actions';

export interface SchoolLearnerRowProps {
  learner: LearnerRow;
  /** Everybody still teaching at the school, for choosing by hand if suggestions cannot be read. */
  instructors: { id: string; name: string }[];
  /** Whether the instructor they are with is switched off, so somebody else should have them (D-317). */
  teacherSwitchedOff: boolean;
}

/** LRN-06, SCH-03: one learner at a school, the instructor they are with, and who else suits them. */
export function SchoolLearnerRow({ learner, instructors, teacherSwitchedOff }: SchoolLearnerRowProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [teacher, setTeacher] = useState(learner.instructorName);
  const [teacherOff, setTeacherOff] = useState(teacherSwitchedOff);
  const [error, setError] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<AllocationState>({ kind: 'loading' });
  // Only the newest opening's answer counts, however the answers arrive.
  const asked = useRef(0);

  const openSheet = () => {
    setError(null);
    setAllocation({ kind: 'loading' });
    setOpen(true);
    const ask = ++asked.current;
    void (async () => {
      const result = await suggestInstructors(learner.learnerId);
      if (ask !== asked.current) return;
      setAllocation(
        result.ok
          ? { kind: 'ready', suggestions: result.data.suggestions, everybody: result.data.everybody }
          : { kind: 'failed', everybody: instructors },
      );
    })();
  };

  const give = (instructor: { id: string; name: string }) => {
    if (instructor.name === teacher) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignLearner({ learnerId: learner.learnerId, instructorId: instructor.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTeacher(instructor.name);
      setTeacherOff(false);
      setOpen(false);
      toast(`${learner.fullName} is with ${instructor.name} now`);
    });
  };

  return (
    <article className="relative flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-grey-100 focus-within:bg-grey-100">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          {/* The whole row opens their card, as the instructor's list does, and Assign stays a button
              of its own above it (LRN-02, PRD 6.2, D-330). */}
          <Link
            href={`/app/school/learners/${learner.learnerId}`}
            className="truncate text-body font-semibold text-black after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
          >
            {learner.fullName}
          </Link>
          <StatusPill status={statusPill(learner.status)} className="shrink-0">
            {learnerStatusLabels[learner.status]}
          </StatusPill>
        </span>
        <span className="text-small text-grey-700">
          {teacher === null ? 'Nobody yet' : teacherOff ? `With ${teacher}, who is switched off` : `With ${teacher}`} ·{' '}
          {lessonsTakenLine(learner.lessonsTaken)}
          {/* "No lessons yet" is about lessons had: one booked is said too, as the instructor's list says it (D-345). */}
          {learner.nextLessonAt === null ? null : ` · Next ${formatDateTime(new Date(learner.nextLessonAt))}`}
        </span>
      </span>
      <Button variant="secondary" className="relative" pending={pending} onClick={openSheet}>
        Assign
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Who teaches ${learner.fullName}?`}
        description="Suggested by the area they cover, the gearbox they teach and their free time. The learner keeps their lessons, notes and history."
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <AllocationChoices state={allocation} current={teacher} disabled={pending} onChoose={give} />
        </div>
      </Sheet>
    </article>
  );
}
