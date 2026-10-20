'use client';

import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Inbox, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Enquiry, EnquiryStatus } from '@/lib/school/enquiries';
import { EnquiryForm } from './enquiry-form';

const tabs: { status: EnquiryStatus; label: string; empty: string }[] = [
  { status: 'new', label: 'New', empty: 'Nobody new. People who ask on your page appear here.' },
  { status: 'offered', label: 'Offered', empty: 'Nobody waiting on an instructor to answer.' },
  { status: 'taken', label: 'Taken', empty: 'Nobody taken by an instructor yet.' },
  { status: 'closed', label: 'Closed', empty: 'Nothing closed.' },
];

const gearboxWords = { manual: 'Manual', automatic: 'Automatic' } as const;

export interface EnquiryHandlers {
  add: Parameters<typeof EnquiryForm>[0]['onSave'];
  close: (input: { enquiryId: string; reason: string }) => Promise<Result<null>>;
  reopen: (enquiryId: string) => Promise<Result<null>>;
  refresh: () => void;
}

/**
 * The school's new pupils (M9-16, D-288): who asked, from its page or through the office, in four
 * parts, new, offered, taken and closed. More ways to act on one arrive with offers to instructors.
 */
export function EnquiryInbox({
  status,
  counts,
  enquiries,
  consentWords,
  handlers,
  actions,
}: {
  status: EnquiryStatus;
  counts: Record<EnquiryStatus, number>;
  enquiries: readonly Enquiry[];
  consentWords: string;
  handlers: EnquiryHandlers;
  /** What else can be done with a new or offered enquiry, beside closing it. */
  actions?: (enquiry: Enquiry) => ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<Enquiry | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const tab = tabs.find((one) => one.status === status) ?? tabs[0];

  const act = async (enquiryId: string, run: () => Promise<Result<null>>, done: string) => {
    setBusyId(enquiryId);
    const result = await run();
    setBusyId(null);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    toast(done);
    handlers.refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="New pupils" className="flex flex-wrap gap-2">
          {tabs.map((one) => (
            <Link
              key={one.status}
              href={one.status === 'new' ? '/app/school/pupils' : `/app/school/pupils?status=${one.status}`}
              aria-current={one.status === status ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-2 rounded-full px-4 text-small font-semibold ${
                one.status === status ? 'bg-black text-white' : 'bg-quiet text-black hover:bg-quiet-strong'
              }`}
            >
              {one.label}
              <span className="tabular-nums">{counts[one.status]}</span>
            </Link>
          ))}
        </nav>
        <Button variant="secondary" onClick={() => { setAdding(true); }}>
          <UserPlus className="size-5" aria-hidden />
          Add a pupil
        </Button>
      </div>

      {enquiries.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title={`${tab?.label ?? 'New'}: nobody`} description={tab?.empty ?? ''} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${tab?.label ?? 'New'} pupils`}>
          {enquiries.map((enquiry) => (
            <li key={enquiry.enquiryId}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <h2 className="text-h3 text-black">{enquiry.fullName}</h2>
                    <p className="text-small text-grey-700">
                      Asked {enquiry.receivedOn}, {enquiry.source === 'office' ? 'added by the office' : 'from your page'}
                    </p>
                    {enquiry.offeredTo ?? enquiry.takenBy ? (
                      <p className="text-small font-semibold text-ink">{enquiry.offeredTo ?? enquiry.takenBy}</p>
                    ) : null}
                  </div>
                  <StatusPill status="pending">{enquiry.transmission === null ? 'Either gearbox' : gearboxWords[enquiry.transmission]}</StatusPill>
                </div>
                <dl className="grid gap-1 text-small text-ink sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="font-semibold">Postcode</dt>
                  <dd>{enquiry.postcode}</dd>
                  {enquiry.email ? (
                    <>
                      <dt className="font-semibold">Email</dt>
                      <dd className="break-all">{enquiry.email}</dd>
                    </>
                  ) : null}
                  {enquiry.phone ? (
                    <>
                      <dt className="font-semibold">Mobile</dt>
                      <dd>{enquiry.phone}</dd>
                    </>
                  ) : null}
                  {enquiry.note ? (
                    <>
                      <dt className="font-semibold">When suits</dt>
                      <dd>{enquiry.note}</dd>
                    </>
                  ) : null}
                  {enquiry.closedReason ? (
                    <>
                      <dt className="font-semibold">Closed</dt>
                      <dd>{enquiry.closedReason}</dd>
                    </>
                  ) : null}
                </dl>
                {enquiry.status === 'new' || enquiry.status === 'offered' ? (
                  <div className="flex flex-wrap gap-2">
                    {actions?.(enquiry)}
                    <Button
                      variant="secondary"
                      pending={busyId === enquiry.enquiryId}
                      onClick={() => {
                        setReason('');
                        setClosing(enquiry);
                      }}
                    >
                      Close
                    </Button>
                  </div>
                ) : null}
                {enquiry.status === 'closed' ? (
                  <div>
                    <Button
                      variant="secondary"
                      pending={busyId === enquiry.enquiryId}
                      onClick={() => { void act(enquiry.enquiryId, () => handlers.reopen(enquiry.enquiryId), 'Opened again'); }}
                    >
                      Open again
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={adding} onOpenChange={setAdding} title="Add a pupil" description="Somebody who rang or called in, once they have agreed.">
        <EnquiryForm
          mode="office"
          idPrefix="office-"
          consentWords={consentWords}
          onSave={handlers.add}
          onSaved={() => {
            setAdding(false);
            toast('Added to New');
            handlers.refresh();
          }}
        />
      </Sheet>
      <Dialog
        open={closing !== null}
        onOpenChange={(open) => { if (!open) setClosing(null); }}
        title={`Close ${closing?.fullName ?? 'this enquiry'}?`}
        description="It moves to Closed, and you can open it again."
        footer={
          <>
            <Button variant="secondary" onClick={() => { setClosing(null); }}>
              Keep it
            </Button>
            <Button
              onClick={() => {
                const one = closing;
                setClosing(null);
                if (one !== null) void act(one.enquiryId, () => handlers.close({ enquiryId: one.enquiryId, reason }), 'Closed');
              }}
            >
              Close
            </Button>
          </>
        }
      >
        <Field label="Why?" hint="Optional, like Booked with somebody else.">
          <Input id="close-reason" value={reason} maxLength={200} autoComplete="off" onChange={(event) => { setReason(event.target.value); }} />
        </Field>
      </Dialog>
    </div>
  );
}
