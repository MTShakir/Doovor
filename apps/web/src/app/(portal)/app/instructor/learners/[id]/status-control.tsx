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
}

/** LRN-05: the six places a learner can be, and one tap to move them between them. */
export function StatusControl({ learnerId, status, name }: StatusControlProps) {
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
      toast(`${name} is now ${learnerStatusLabels[next].toLowerCase()}`);
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
                <span className="text-small text-grey-700">{learnerStatusHints[one]}</span>
              </span>
              {one === current ? <Check className="size-5 shrink-0 text-black" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
