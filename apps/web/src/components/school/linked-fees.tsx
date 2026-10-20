'use client';

import { formatPence } from '@repo/core/money';
import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Sheet } from '@repo/ui/sheet';
import { toast, toastWithUndo } from '@repo/ui/toast';
import { useState } from 'react';
import type { LinkedFees } from '@/lib/school/fees';
import { FeeList } from './fee-list';
import { FeeTermsForm } from './fee-terms-form';

export interface LinkedFeesHandlers {
  saveTerms: Parameters<typeof FeeTermsForm>[0]['onSave'];
  settle: (input: { feeId: string; outcome: 'paid' | 'written_off' | 'owed'; note?: string }) => Promise<Result<null>>;
  /** Reads the screen again once something has changed. */
  refresh: () => void;
}

/**
 * One linked instructor on the school's Fees screen (M9-11, M9-13, D-287): what they pay, what is
 * owed, a way to change the terms, and each fee to mark paid or write off, with a moment to undo.
 */
export function LinkedFeesCard({ linked, handlers, idPrefix = '' }: { linked: LinkedFees; handlers: LinkedFeesHandlers; idPrefix?: string }) {
  const [changing, setChanging] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const titleId = `${idPrefix}fees-${linked.linkId}`;

  const settle = async (feeId: string, outcome: 'paid' | 'written_off' | 'owed', note?: string): Promise<boolean> => {
    setBusyId(feeId);
    const result = await handlers.settle({ feeId, outcome, ...(note === undefined ? {} : { note }) });
    setBusyId(null);
    if (!result.ok) {
      toast(result.message);
      return false;
    }
    handlers.refresh();
    return true;
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle id={titleId}>{linked.name}</CardTitle>
          <CardDescription>{linked.businessName}</CardDescription>
        </div>
        <span className="text-body font-semibold tabular-nums text-black">
          {linked.owedPence === 0 ? 'Nothing owed' : `${formatPence(linked.owedPence)} owed`}
        </span>
      </div>
      <ul className="flex flex-col gap-1 text-small text-ink">
        {linked.words.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div>
        <Button variant="secondary" onClick={() => { setChanging(true); }}>
          {linked.words[0] === 'No fees' ? 'Set fees' : 'Change fees'}
        </Button>
      </div>
      <FeeList
        idPrefix={`${titleId}-`}
        fees={linked.fees}
        actions={{
          busyId,
          onPaid: (fee, note) => {
            void settle(fee.feeId, 'paid', note).then((done) => {
              if (done) toastWithUndo(`${formatPence(fee.amountPence)} marked paid`, () => { void settle(fee.feeId, 'owed'); });
            });
          },
          onWriteOff: (fee) => {
            void settle(fee.feeId, 'written_off').then((done) => {
              if (done) toastWithUndo(`${formatPence(fee.amountPence)} written off`, () => { void settle(fee.feeId, 'owed'); });
            });
          },
        }}
      />
      <Sheet
        open={changing}
        onOpenChange={setChanging}
        title={`Fees for ${linked.name}`}
        description="A new amount applies from the next fee."
      >
        <FeeTermsForm
          idPrefix={`${titleId}-`}
          linkId={linked.linkId}
          current={linked.typed}
          onSave={handlers.saveTerms}
          onSaved={() => {
            setChanging(false);
            toast('Fees saved');
            handlers.refresh();
          }}
        />
      </Sheet>
    </Card>
  );
}
