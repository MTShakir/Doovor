'use client';

import { countOf } from '@repo/core/counts';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { Eye, SearchX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AdminInstructorRow, AdminLearnerRow, AdminPerson, BadgeState } from '@/lib/admin/people';

const badgeWords: Record<BadgeState, string> = {
  unsubmitted: 'Badge not sent',
  pending: 'Badge waiting',
  approved: 'Verified',
  rejected: 'Badge not approved',
};
const roleWords = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor' } as const;
const staffWords = { super_admin: 'Super admin', support_admin: 'Support admin' } as const;

const suspendedPill = <StatusPill status="overdue">Suspended</StatusPill>;

function Results<Row extends { userId: string; name: string; suspended: boolean }>({
  rows,
  query,
  what,
  summary,
  onOpen,
}: {
  rows: Row[];
  query: string;
  what: string;
  summary: (row: Row) => string;
  onOpen: (userId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing found"
        description={query === '' ? `There are no ${what} yet.` : 'Check the spelling, or try an email or a mobile.'}
      />
    );
  }
  return (
    <Card padding="none">
      <ul className="py-2">
        {rows.map((row, index) => (
          <li key={row.userId}>
            {index > 0 ? <ListDivider /> : null}
            <ListRow asChild chevron title={row.name} subtitle={summary(row)} trailing={row.suspended ? suspendedPill : null}>
              <button type="button" onClick={() => { onOpen(row.userId); }} />
            </ListRow>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** ADM-02: instructors found, each opening their panel. */
export function InstructorResults({ rows, query, onOpen }: { rows: AdminInstructorRow[]; query: string; onOpen: (userId: string) => void }) {
  return (
    <Results
      rows={rows}
      query={query}
      what="instructors"
      summary={(row) => [row.businessName, badgeWords[row.verification], row.email].filter((part) => part !== null).join(' · ')}
      onOpen={onOpen}
    />
  );
}

/** ADM-02: learners found, each opening their panel. */
export function LearnerResults({ rows, query, onOpen }: { rows: AdminLearnerRow[]; query: string; onOpen: (userId: string) => void }) {
  return (
    <Results
      rows={rows}
      query={query}
      what="learners"
      summary={(row) =>
        [row.businesses === 0 ? 'Not with a Business yet' : `Learns with ${countOf(row.businesses, 'Business', 'Businesses')}`, row.email]
          .filter((part) => part !== null)
          .join(' · ')
      }
      onOpen={onOpen}
    />
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 flex min-w-0 flex-col gap-0.5' : 'flex min-w-0 flex-col gap-0.5'}>
      <dt className="text-small text-grey-700">{label}</dt>
      <dd className="text-body break-words text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1" aria-label={title}>
      <h3 className="text-h3 text-black">{title}</h3>
      <ul>{children}</ul>
    </section>
  );
}

/** Who somebody is, in a few words: "Support admin", "Manager at Quayside Driving School", "Learner". */
function personKind(person: AdminPerson): string {
  if (person.staffRole) return staffWords[person.staffRole];
  const [first] = person.memberships;
  if (first) return person.memberships.length === 1 ? `${roleWords[first.role]} at ${first.businessName}` : roleWords[first.role];
  return person.learnsWith.length > 0 ? 'Learner' : 'No role chosen yet';
}

/** Whether the member of staff looking may change this account, and if not, why not. */
function managing(person: AdminPerson, viewer: { canManage: boolean; userId: string }): { allowed: boolean; note: string | null } {
  if (!viewer.canManage) return { allowed: false, note: 'Only a super admin can suspend an account or reset two-step verification.' };
  if (person.userId === viewer.userId) return { allowed: false, note: 'This is your own account.' };
  if (person.staffRole) return { allowed: true, note: 'Platform staff are not suspended from here.' };
  return { allowed: true, note: null };
}

/** ADM-02: what staff see of a person: their account, where they work and learn, and any suspension. */
export function PersonDetails({ person, viewer }: { person: AdminPerson; viewer: { canManage: boolean; userId: string } }) {
  const { suspension } = person;
  const { note } = managing(person, viewer);
  return (
    <div className="flex flex-col gap-5">
      {suspension ? (
        <div className="flex flex-col gap-1 rounded-card border border-red bg-white px-4 py-3">
          <p className="text-body font-semibold text-red">
            Suspended on {suspension.since}
            {suspension.byName ? ` by ${suspension.byName}` : ''}
          </p>
          <p className="text-body text-ink">{suspension.reason}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* An email is the one fact too long for half the panel. */}
        <Fact label="Email" value={person.email ?? 'Not given'} wide />
        <Fact label="Mobile" value={person.phone ?? 'Not given'} />
        <Fact label="Two-step verification" value={person.twoStep ? 'On' : 'Off'} />
        <Fact label="Joined" value={person.joinedOn} />
        <Fact label="Last signed in" value={person.lastSignedIn ?? 'Never'} />
      </dl>

      {person.memberships.length > 0 ? (
        <Group title="Works for">
          {person.memberships.map((one, index) => (
            <li key={one.businessId}>
              {index > 0 ? <ListDivider className="ml-0" /> : null}
              <ListRow
                className="px-0"
                title={one.businessName}
                subtitle={`${roleWords[one.role]}${one.active ? '' : ', switched off'}`}
                trailing={one.businessSuspended ? suspendedPill : null}
              />
            </li>
          ))}
        </Group>
      ) : null}

      {person.learnsWith.length > 0 ? (
        <Group title="Learns with">
          {person.learnsWith.map((one, index) => (
            <li key={one.businessId}>
              {index > 0 ? <ListDivider className="ml-0" /> : null}
              <ListRow className="px-0" title={one.businessName} />
            </li>
          ))}
        </Group>
      ) : null}

      {note ? <p className="text-small text-grey-700">{note}</p> : null}
    </div>
  );
}

/** ADM-02: one person in a side panel, with what a super admin may do to their account. */
export function PersonSheet({
  person,
  viewer,
  pending,
  onClose,
  onSuspend,
  onReactivate,
  onResetTwoStep,
  onViewAs,
}: {
  person: AdminPerson | null;
  viewer: { canManage: boolean; userId: string };
  pending: boolean;
  onClose: () => void;
  onSuspend: (person: AdminPerson) => void;
  onReactivate: (person: AdminPerson) => void;
  onResetTwoStep: (person: AdminPerson) => void;
  /** Any member of staff may view as somebody who is not staff themselves (ADM-06). */
  onViewAs: (person: AdminPerson) => void;
}) {
  const [shown, setShown] = useState<AdminPerson | null>(person);
  // Keep the last person while the panel closes, so it does not empty as it slides away.
  if (person !== null && person !== shown) setShown(person);
  if (shown === null) return null;

  const { allowed } = managing(shown, viewer);
  const reset = shown.twoStep ? (
    <Button variant="secondary" width="full" onClick={() => { onResetTwoStep(shown); }}>
      Reset two-step verification
    </Button>
  ) : null;
  const standing = shown.suspension ? (
    <Button width="full" pending={pending} onClick={() => { onReactivate(shown); }}>
      Reactivate account
    </Button>
  ) : shown.staffRole ? null : (
    <Button variant="destructive" width="full" onClick={() => { onSuspend(shown); }}>
      Suspend account
    </Button>
  );
  const viewAs =
    shown.staffRole === null && shown.userId !== viewer.userId ? (
      <Button variant="secondary" width="full" onClick={() => { onViewAs(shown); }}>
        <Eye className="size-5" aria-hidden />
        View as {shown.name}
      </Button>
    ) : null;
  const footer =
    viewAs !== null || (allowed && (reset !== null || standing !== null)) ? (
      <div className="flex flex-col gap-2">
        {viewAs}
        {allowed ? reset : null}
        {allowed ? standing : null}
      </div>
    ) : null;

  return (
    <Sheet
      open={person !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={shown.name}
      description={personKind(shown)}
      {...(footer ? { footer } : {})}
    >
      <PersonDetails person={shown} viewer={viewer} />
    </Sheet>
  );
}

/** ADM-02: suspending an account asks first, and asks why. */
export function SuspendAccountDialog({
  person,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  person: AdminPerson | null;
  pending: boolean;
  error: string | undefined;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState<AdminPerson | null>(person);
  const [reason, setReason] = useState('');
  // Keep the words while the dialog closes, and start with no reason for each person.
  if (person !== null && person !== shown) {
    setShown(person);
    if (person.userId !== shown?.userId) setReason('');
  }

  return (
    <Dialog
      open={person !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`Suspend ${shown?.name ?? ''}?`}
      description="They are signed out everywhere at once and cannot sign in until the account is reactivated. Their lessons and records stay as they are."
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
      <Field label="Why?" hint="Kept with the account and in the audit log. They are not shown it." error={error}>
        <Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); }} />
      </Field>
    </Dialog>
  );
}

/** ADM-02, AUTH-08: resetting two-step verification asks first, because it is how accounts are taken over. */
export function ResetTwoStepDialog({
  person,
  pending,
  onConfirm,
  onCancel,
}: {
  person: AdminPerson | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState<AdminPerson | null>(person);
  if (person !== null && person !== shown) setShown(person);

  return (
    <Dialog
      open={person !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`Reset two-step verification for ${shown?.name ?? ''}?`}
      description="Their authenticator app stops working for this account and they are signed out everywhere. The next time they sign in, they set it up again."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep it
          </Button>
          <Button pending={pending} onClick={onConfirm}>
            Reset
          </Button>
        </>
      }
    >
      <p className="text-body text-ink">
        Check that the request really comes from them first, from the email or mobile on the account. Resetting it for
        somebody else is how an account is taken over.
      </p>
    </Dialog>
  );
}

/** ADM-06: viewing as somebody asks why, and says it changes nothing and is recorded. */
export function ViewAsDialog({
  person,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  person: AdminPerson | null;
  pending: boolean;
  error: string | undefined;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState<AdminPerson | null>(person);
  const [reason, setReason] = useState('');
  // Keep the words while the dialog closes, and start with no reason for each person.
  if (person !== null && person !== shown) {
    setShown(person);
    if (person.userId !== shown?.userId) setReason('');
  }

  return (
    <Dialog
      open={person !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`View as ${shown?.name ?? ''}?`}
      description="You see their screens as they do, and nothing you do there changes anything. It ends when you stop, or by itself after 30 minutes."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep it
          </Button>
          <Button pending={pending} onClick={() => { onConfirm(reason); }}>
            View as them
          </Button>
        </>
      }
    >
      <Field label="Why?" hint="Kept in the audit log, with who looked and when." error={error}>
        <Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); }} />
      </Field>
    </Dialog>
  );
}
