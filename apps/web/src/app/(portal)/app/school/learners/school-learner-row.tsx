'use client';

import { learnerStatusLabels, lessonsTakenLine } from '@repo/core/learners';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LearnerRow } from '@/lib/learners/list';
import { statusPill } from '@/lib/learners/status-pill';
import { assignLearner } from './actions';

export interface SchoolLearnerRowProps {
  learner: LearnerRow;
  instructors: { id: string; name: string }[];
}

/** LRN-06: one learner at a school, and the instructor they are with. */
export function SchoolLearnerRow({ learner, instructors }: SchoolLearnerRowProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [teacher, setTeacher] = useState(learner.instructorName);
  const [error, setError] = useState<string | null>(null);

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
      setOpen(false);
      toast(`${learner.fullName} is with ${instructor.name} now`);
    });
  };

  return (
    <article className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body font-semibold text-black">{learner.fullName}</span>
          <StatusPill status={statusPill(learner.status)} className="shrink-0">
            {learnerStatusLabels[learner.status]}
          </StatusPill>
        </span>
        <span className="text-small text-grey-700">
          {teacher === null ? 'Nobody yet' : `With ${teacher}`} · {lessonsTakenLine(learner.lessonsTaken)}
        </span>
      </span>
      <Button variant="secondary" pending={pending} onClick={() => { setOpen(true); }}>
        Assign
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={`Who teaches ${learner.fullName}?`}
        description="The learner keeps their lessons, their notes and their history."
      >
        <div className="flex flex-col gap-2">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {instructors.map((instructor) => (
            <button
              key={instructor.id}
              type="button"
              disabled={pending}
              aria-current={instructor.name === teacher}
              onClick={() => { give(instructor); }}
              className="flex min-h-14 items-center gap-3 rounded-card px-4 py-3 text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black disabled:opacity-60"
            >
              <span className="flex-1 text-body font-semibold text-black">{instructor.name}</span>
              {instructor.name === teacher ? <Check className="size-5 shrink-0 text-black" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </article>
  );
}
