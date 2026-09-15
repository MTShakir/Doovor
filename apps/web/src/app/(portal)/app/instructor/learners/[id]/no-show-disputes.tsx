'use client';

import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { NoShowDispute } from '@/lib/payments/disputes';
import { decideNoShowDispute } from './money-actions';

interface DisputesProps {
  disputes: NoShowDispute[];
  learnerId: string;
  learnerName: string;
  /** Deciding gives money back, so only the people who run the Business can (PRD 6.2). */
  canDecide: boolean;
}

/**
 * A learner's disputes of no-shows (R-09, M3-19): what they said, and, for whoever runs the
 * Business, a way to waive the fee or keep it. The instructor whose lesson it was reads them too.
 */
export function NoShowDisputes({ disputes, learnerId, learnerName, canDecide }: DisputesProps) {
  if (disputes.length === 0) return null;

  return (
    <ul className="flex flex-col border-t border-grey-200" aria-label="No-show disputes">
      {disputes.map((dispute) => (
        <DisputeRow key={dispute.id} dispute={dispute} learnerId={learnerId} learnerName={learnerName} canDecide={canDecide} />
      ))}
    </ul>
  );
}

function DisputeRow({ dispute, learnerId, learnerName, canDecide }: Omit<DisputesProps, 'disputes'> & { dispute: NoShowDispute }) {
  const [deciding, setDeciding] = useState<'waived' | 'kept' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lessonAt = new Date(dispute.lessonAt);
  const waiving = deciding === 'waived';

  const choose = (outcome: 'waived' | 'kept') => {
    setError(null);
    setDeciding(outcome);
  };

  const decide = () => {
    if (deciding === null) return;
    const outcome = deciding;
    setError(null);
    startTransition(async () => {
      const result = await decideNoShowDispute({ disputeId: dispute.id, learnerId, outcome, note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeciding(null);
      setNote('');
      toast(outcome === 'waived' ? 'Fee waived' : 'Fee kept');
    });
  };

  return (
    <li className="flex flex-col gap-2 border-b border-grey-200 px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-body font-medium text-ink">
            No-show on {formatDate(lessonAt)} at {formatTime(lessonAt)}
          </span>
          <span className="text-small text-grey-700">
            {learnerName} says: {dispute.reason}
          </span>
          {dispute.note ? <span className="text-small text-grey-700">Note: {dispute.note}</span> : null}
        </span>
        <StatusPill status={dispute.outcome === null ? 'pending' : dispute.outcome === 'waived' ? 'paid' : 'cancelled'}>
          {dispute.outcome === null ? 'Disputed' : dispute.outcome === 'waived' ? 'Fee waived' : 'Fee kept'}
        </StatusPill>
      </div>

      {canDecide && dispute.outcome === null ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => { choose('waived'); }}>
            Waive the fee
          </Button>
          <Button variant="tertiary" onClick={() => { choose('kept'); }}>
            Keep the fee
          </Button>
        </div>
      ) : null}

      <Sheet
        open={deciding !== null}
        onOpenChange={() => { setDeciding(null); }}
        title={waiving ? `Waive ${learnerName}'s fee?` : `Keep ${learnerName}'s fee?`}
        description={
          waiving
            ? 'Whatever paid it goes back the way it came, and nothing is owed.'
            : 'The fee stands as it is, and they are told.'
        }
        footer={
          <Button width="full" size="lg" pending={pending} onClick={decide}>
            {waiving ? 'Waive the fee' : 'Keep the fee'}
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label={`A note for ${learnerName}`} hint="Optional. They see it with the lesson.">
            <Textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); }} />
          </Field>
        </div>
      </Sheet>
    </li>
  );
}
