'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { Dialog } from '@repo/ui/dialog';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { StatusPill } from '@repo/ui/status-pill';
import { useState } from 'react';
import type { FeeLine, FeeStatus } from '@/lib/school/fees';

const pills: Record<FeeStatus, { status: 'unpaid' | 'paid' | 'pending'; words: string }> = {
  owed: { status: 'unpaid', words: 'Owed' },
  paid: { status: 'paid', words: 'Paid' },
  written_off: { status: 'pending', words: 'Written off' },
};

export interface FeeActions {
  /** The fee being changed, while the database answers. */
  busyId: string | null;
  onPaid: (fee: FeeLine, note: string) => void;
  onWriteOff: (fee: FeeLine) => void;
}

/**
 * The fees a linked instructor owes a school, newest first (M9-13, D-287). The school marks one
 * paid, saying how, or writes it off; the instructor sees the same list without the buttons.
 */
export function FeeList({ fees, actions, idPrefix = '' }: { fees: readonly FeeLine[]; actions?: FeeActions; idPrefix?: string }) {
  const [paying, setPaying] = useState<FeeLine | null>(null);
  const [note, setNote] = useState('');

  if (fees.length === 0) return <p className="text-small text-grey-700">No fees have fallen due yet.</p>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-grey-200 rounded-card border border-grey-200 bg-white" aria-label="Fees">
        {fees.map((fee) => (
          <li key={fee.feeId} className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-body font-semibold text-black">{fee.label}</span>
                <span className="text-small text-grey-700">
                  Due {fee.due}
                  {fee.note === null ? '' : `, ${fee.note}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-body font-semibold tabular-nums text-black">{formatPence(fee.amountPence)}</span>
                <StatusPill status={pills[fee.status].status}>{pills[fee.status].words}</StatusPill>
              </div>
            </div>
            {actions && fee.status === 'owed' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  pending={actions.busyId === fee.feeId}
                  onClick={() => {
                    setNote('');
                    setPaying(fee);
                  }}
                >
                  Mark paid
                </Button>
                <Button variant="secondary" disabled={actions.busyId === fee.feeId} onClick={() => { actions.onWriteOff(fee); }}>
                  Write off
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {actions ? (
        <Dialog
          open={paying !== null}
          onOpenChange={(open) => { if (!open) setPaying(null); }}
          title={`Mark ${paying === null ? 'this fee' : formatPence(paying.amountPence)} paid?`}
          description="For a fee paid outside the app, such as by bank transfer or in cash."
          footer={
            <>
              <Button variant="secondary" onClick={() => { setPaying(null); }}>
                Not yet
              </Button>
              <Button
                onClick={() => {
                  if (paying !== null) actions.onPaid(paying, note);
                  setPaying(null);
                }}
              >
                Mark paid
              </Button>
            </>
          }
        >
          <Field label="How was it paid?" hint="Optional, like Bank transfer.">
            <Input id={`${idPrefix}fee-note`} value={note} maxLength={200} autoComplete="off" onChange={(event) => { setNote(event.target.value); }} />
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}
