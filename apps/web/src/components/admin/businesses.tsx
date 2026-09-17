'use client';

import { countOf, formatCount } from '@repo/core/counts';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { SearchX } from 'lucide-react';
import { useState } from 'react';
import type { AdminBusiness, AdminBusinessRow, AdminMember } from '@/lib/admin/businesses';

const typeWords = { independent: 'Independent instructor', school: 'Driving school' } as const;
const roleWords = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor' } as const;
const badgeWords = {
  unsubmitted: 'badge not sent',
  pending: 'badge waiting',
  approved: 'verified',
  rejected: 'badge not approved',
} as const;
const standingWords = { pending: 'Being set up', active: 'In good standing', suspended: 'Suspended' } as const;

function rowSummary(row: AdminBusinessRow): string {
  return [
    typeWords[row.type],
    row.type === 'school' ? countOf(row.instructors, 'instructor', 'instructors') : null,
    row.ownerName,
    row.postcode,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** ADM-02: Businesses found, each opening its panel. */
export function BusinessResults({
  rows,
  query,
  onOpen,
}: {
  rows: AdminBusinessRow[];
  query: string;
  onOpen: (row: AdminBusinessRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing found"
        description={query === '' ? 'There are no Businesses yet.' : 'Check the spelling, or try a postcode, an email or a mobile.'}
      />
    );
  }
  return (
    <Card padding="none">
      <ul className="py-2">
        {rows.map((row, index) => (
          <li key={row.businessId}>
            {index > 0 ? <ListDivider /> : null}
            <ListRow
              asChild
              chevron
              title={row.name}
              subtitle={rowSummary(row)}
              trailing={row.status === 'suspended' ? <StatusPill status="overdue">Suspended</StatusPill> : null}
            >
              <button type="button" onClick={() => { onOpen(row); }} />
            </ListRow>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-small text-grey-700">{label}</dt>
      <dd className="text-body text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function memberSummary(member: AdminMember): string {
  const role = `${roleWords[member.role]}${member.verification ? `, ${badgeWords[member.verification]}` : ''}${member.active ? '' : ', switched off'}`;
  return member.contact === null ? role : `${role} · ${member.contact}`;
}

/** ADM-02: what staff see of one Business: its standing, its figures and everybody who works there. */
export function BusinessDetails({ business, canSuspend }: { business: AdminBusiness; canSuspend: boolean }) {
  const { suspension } = business;
  return (
    <div className="flex flex-col gap-5">
      {suspension ? (
        <div className="flex flex-col gap-1 rounded-card border border-red bg-white px-4 py-3">
          <p className="text-body font-semibold text-red">
            Suspended{suspension.since ? ` on ${suspension.since}` : ''}
            {suspension.byName ? ` by ${suspension.byName}` : ''}
          </p>
          <p className="text-body text-ink">{suspension.reason ?? 'No reason was kept.'}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact label="Standing" value={standingWords[business.status]} />
        <Fact label="Joined" value={business.joinedOn} />
        <Fact label="Postcode" value={business.postcode ?? 'Not given'} />
        <Fact label="Card payments" value={business.takesCards ? 'Taken' : 'Not set up'} />
        <Fact label="Learners" value={formatCount(business.learners)} />
        <Fact label="Lessons to come" value={formatCount(business.lessonsToCome)} />
      </dl>

      <section className="flex flex-col gap-1" aria-label="People">
        <h3 className="text-h3 text-black">People</h3>
        <ul>
          {business.members.map((member, index) => (
            <li key={member.userId}>
              {index > 0 ? <ListDivider className="ml-0" /> : null}
              <ListRow className="px-0" title={member.name} subtitle={memberSummary(member)} />
            </li>
          ))}
        </ul>
      </section>

      {canSuspend ? null : (
        <p className="text-small text-grey-700">Only a super admin can suspend or reactivate a Business.</p>
      )}
    </div>
  );
}

/** ADM-02: one Business in a side panel, with Suspend or Reactivate for a super admin. */
export function BusinessSheet({
  business,
  canSuspend,
  pending,
  onClose,
  onSuspend,
  onReactivate,
}: {
  business: AdminBusiness | null;
  canSuspend: boolean;
  pending: boolean;
  onClose: () => void;
  onSuspend: (business: AdminBusiness) => void;
  onReactivate: (business: AdminBusiness) => void;
}) {
  const [shown, setShown] = useState<AdminBusiness | null>(business);
  // Keep the last Business while the panel closes, so it does not empty as it slides away.
  if (business !== null && business !== shown) setShown(business);
  if (shown === null) return null;

  const footer = !canSuspend ? undefined : shown.status === 'suspended' ? (
    <Button width="full" pending={pending} onClick={() => { onReactivate(shown); }}>
      Reactivate
    </Button>
  ) : (
    <Button variant="destructive" width="full" onClick={() => { onSuspend(shown); }}>
      Suspend
    </Button>
  );

  return (
    <Sheet
      open={business !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={shown.name}
      description={typeWords[shown.type]}
      {...(footer ? { footer } : {})}
    >
      <BusinessDetails business={shown} canSuspend={canSuspend} />
    </Sheet>
  );
}

/** ADM-02: suspending asks first, and asks why. */
export function SuspendBusinessDialog({
  business,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  business: AdminBusiness | null;
  pending: boolean;
  error: string | undefined;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState<AdminBusiness | null>(business);
  const [reason, setReason] = useState('');
  // Keep the words while the dialog closes, and start with no reason for each Business.
  if (business !== null && business !== shown) {
    setShown(business);
    if (business.businessId !== shown?.businessId) setReason('');
  }
  const lessons = shown?.lessonsToCome ?? 0;

  return (
    <Dialog
      open={business !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`Suspend ${shown?.name ?? ''}?`}
      description="Nobody can book or pay for lessons with it, its public pages and booking link go, and the people who work there lose its portal. You can reactivate it at any time."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep it open
          </Button>
          <Button variant="destructive" pending={pending} onClick={() => { onConfirm(reason); }}>
            Suspend
          </Button>
        </>
      }
    >
      <Field label="Why?" hint="Kept with the Business and in the audit log. The Business is not shown it." error={error}>
        <Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); }} />
      </Field>
      {lessons > 0 ? (
        <p className="text-body text-ink">
          {lessons === 1 ? 'Its 1 lesson to come stays' : `Its ${formatCount(lessons)} lessons to come stay`} booked, for the
          Business or you to sort out with the learners.
        </p>
      ) : null}
    </Dialog>
  );
}
