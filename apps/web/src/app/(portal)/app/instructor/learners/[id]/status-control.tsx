'use client';

import { learnerStatusHints, learnerStatusLabels, learnerStatuses, type LearnerStatus } from '@repo/core/learners';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Check, ChevronDown } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { statusPill } from '@/lib/learners/status-pill';
import { setLearnerStatus } from './actions';

export interface StatusControlProps {
  learnerId: string;
  status: LearnerStatus;
  name: string;
  /** Lessons still to come, which stay booked whatever their status says (D-380, D-402). */
  lessonsToCome?: number;
}

/** What marking somebody as having left does not do: call off what they have booked. */
function stillBooked(count: number): string {
  return count === 1 ? 'Their 1 lesson to come stays booked until you call it off.' : `Their ${String(count)} lessons to come stay booked until you call them off.`;
}

/** LRN-05: the six places a learner can be, and one tap to move them between them. */
export function StatusControl({ learnerId, status, name, lessonsToCome = 0 }: StatusControlProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);

  const choose = (next: LearnerStatus) => {
    if (next === current) {
      setOpen(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setLearnerStatus({ learnerId, status: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(next);
      setOpen(false);
      toast(
        next === 'left' && lessonsToCome > 0
          ? `${name} is now left. ${stillBooked(lessonsToCome)}`
          : `${name} is now ${learnerStatusLabels[next].toLowerCase()}`,
      );
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); }}
        aria-label={`Where they are up to: ${learnerStatusLabels[current]}. Change it.`}
        className="flex h-12 items-center gap-1 rounded-full pr-2 text-black hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <StatusPill status={statusPill(current)}>{learnerStatusLabels[current]}</StatusPill>
        <ChevronDown className="size-4" aria-hidden />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Where are they up to?"
        description={`This decides which list ${name} appears in.`}
      >
        <div className="flex flex-col gap-2">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {learnerStatuses.map((one) => (
            <button
              key={one}
              type="button"
              disabled={pending}
              onClick={() => { choose(one); }}
              aria-current={one === current}
              className="flex min-h-14 items-center gap-3 rounded-card px-4 py-3 text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black disabled:opacity-60"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold text-black">{learnerStatusLabels[one]}</span>
                <span className="text-small text-grey-700">
                  {one === 'left' && lessonsToCome > 0 ? `${learnerStatusHints[one]}. ${stillBooked(lessonsToCome)}` : learnerStatusHints[one]}
                </span>
              </span>
              {one === current ? <Check className="size-5 shrink-0 text-black" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
