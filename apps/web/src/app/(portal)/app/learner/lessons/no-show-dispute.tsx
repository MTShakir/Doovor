'use client';

import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { MyLesson } from '@/lib/learner/lessons';
import { disputeNoShow } from './actions';

/** What the line under a no-show says, from where its dispute stands. */
function standing(lesson: MyLesson, canDispute: boolean, until: Date | null): string {
  if (lesson.dispute?.outcome === 'waived') return 'You disputed this no-show, and the fee was waived.';
  if (lesson.dispute?.outcome === 'kept') return 'You disputed this no-show, and the fee stands.';
  if (lesson.dispute) return 'You disputed this no-show. You will be told what is decided.';
  if (canDispute && until !== null) return `Marked as a no-show. If that is wrong, you can dispute it until ${formatDate(until)}.`;
  return 'Marked as a no-show.';
}

/**
 * A lesson the learner was marked as not coming to (R-09, M3-19): until when they can say it was
 * wrong, a way to say so, and what became of it once decided.
 */
export function NoShowDispute({ lesson, now }: { lesson: MyLesson; now: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const until = lesson.disputeUntil === null ? null : new Date(lesson.disputeUntil);
  const canDispute = lesson.dispute === null && until !== null && new Date(now).getTime() <= until.getTime();
  const startsAt = new Date(lesson.startsAt);

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await disputeNoShow({ bookingId: lesson.id, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setReason('');
      toast('Dispute sent');
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-grey-700">{standing(lesson, canDispute, until)}</p>
      {lesson.dispute?.note ? <p className="text-small text-grey-700">Their note: {lesson.dispute.note}</p> : null}
      {canDispute ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            Dispute
          </Button>
        </div>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title="Dispute this no-show?"
        description={`${formatDate(startsAt)} at ${formatTime(startsAt)} with ${lesson.instructorName}.`}
        footer={
          <Button width="full" size="lg" pending={pending} disabled={reason.trim() === ''} onClick={send}>
            Send dispute
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="What happened?" hint="Whoever runs the driving school reads this and decides whether the fee stands.">
            <Textarea value={reason} maxLength={1000} onChange={(event) => { setReason(event.target.value); }} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
