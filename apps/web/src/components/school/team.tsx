'use client';

import { formatUkMobile } from '@repo/core/phone';
import type { MemberPermission } from '@repo/core/schemas/school';
import { Avatar } from '@repo/ui/avatar';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { Switch } from '@repo/ui/switch';
import { CalendarDays, Users } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { TeamMember, WaitingInvitation } from '@/lib/school/team';
import { avatarUrl } from '@/lib/storage/images';

export interface TeamHandlers {
  /** Whether the person looking is the owner: only they decide about managers. */
  viewerIsOwner: boolean;
  /** The member or invitation a change is on its way for, so its controls wait. */
  busyId: string | null;
  onPermission: (member: TeamMember, permission: MemberPermission, allowed: boolean) => void;
  onSwitch: (member: TeamMember, active: boolean) => void;
  onCancelInvitation: (invitation: WaitingInvitation) => void;
}

function lessonsToCome(count: number): string {
  if (count === 0) return 'no lessons to come';
  return count === 1 ? '1 lesson to come' : `${String(count)} lessons to come`;
}

function sentence(words: string[]): string {
  const text = words.filter((word) => word !== '').join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The line under a name: what they are, how busy, and what they have been allowed. */
function memberSummary(member: TeamMember): string {
  if (member.role === 'manager') {
    return sentence(['manager', member.active ? '' : 'switched off', member.viewRevenue ? 'sees revenue' : '', member.isYou ? 'this is you' : '']);
  }
  return sentence([
    member.active ? '' : 'switched off',
    lessonsToCome(member.lessonsToCome),
    member.setOwnPrices ? 'sets their own prices' : '',
  ]);
}

function contactOf(one: { phone: string | null; email: string | null }): string | null {
  return one.phone ? formatUkMobile(one.phone) : one.email;
}

/** A manager is the owner's to decide about, and nobody decides about themselves. */
function canManage(member: TeamMember, viewerIsOwner: boolean): boolean {
  return !member.isYou && (member.role === 'instructor' || viewerIsOwner);
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <Card padding="none" role="region" aria-labelledby={`${id}-title`}>
      <div className="flex flex-col gap-1 px-4 pt-4 pb-2">
        <CardTitle id={`${id}-title`}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {children}
    </Card>
  );
}

function Rows<T>({ items, keyOf, render }: { items: T[]; keyOf: (item: T) => string; render: (item: T) => ReactNode }) {
  return (
    <ul className="pb-2">
      {items.map((item, index) => (
        <li key={keyOf(item)}>
          {index > 0 ? <ListDivider /> : null}
          {render(item)}
        </li>
      ))}
    </ul>
  );
}

/** One line for one person; opening it shows what can be changed about them (PRD 7.1). */
function MemberRow({ member, manageable, onOpen }: { member: TeamMember; manageable: boolean; onOpen: () => void }) {
  const leading = <Avatar name={member.name} src={avatarUrl(member.photoPath)} size="md" decorative />;
  if (!manageable) return <ListRow title={member.name} subtitle={memberSummary(member)} leading={leading} />;
  return (
    <ListRow asChild title={member.name} subtitle={memberSummary(member)} leading={leading} chevron>
      <button type="button" aria-label={`${member.name}, ${memberSummary(member)}`} onClick={onOpen} />
    </ListRow>
  );
}

/** Everything that can be changed about one person, in a sheet on a phone and a panel on a desk. */
function MemberSheet({ member, handlers, onClose }: { member: TeamMember | null; handlers: TeamHandlers; onClose: () => void }) {
  const [shown, setShown] = useState<TeamMember | null>(member);
  // Keep the last person while the sheet closes, so it does not empty as it slides away.
  if (member !== null && member !== shown) setShown(member);
  if (shown === null) return null;

  const busy = handlers.busyId === shown.membershipId;
  const contact = contactOf(shown);
  const switchButton = shown.active ? (
    <Button
      variant="secondary"
      width="full"
      pending={busy}
      onClick={() => {
        onClose();
        handlers.onSwitch(shown, false);
      }}
    >
      Switch off
    </Button>
  ) : (
    <Button width="full" pending={busy} onClick={() => { handlers.onSwitch(shown, true); }}>
      Switch back on
    </Button>
  );

  return (
    <Sheet
      open={member !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={shown.name}
      description={memberSummary(shown)}
      footer={switchButton}
    >
      <div className="flex flex-col gap-4">
        {contact ? <p className="text-body text-ink">{contact}</p> : null}
        {shown.instructorId && shown.active ? (
          <Button asChild variant="secondary" width="full">
            <Link href={`/app/school/diary?instructor=${shown.instructorId}` as Route}>
              <CalendarDays className="size-5" aria-hidden />
              Open their diary
            </Link>
          </Button>
        ) : null}
        {shown.active && shown.role === 'instructor' ? (
          <Switch
            label="Sets their own prices"
            description="Otherwise they teach at the school's prices."
            checked={shown.setOwnPrices}
            disabled={busy}
            onCheckedChange={(allowed) => { handlers.onPermission(shown, 'set_own_prices', allowed); }}
          />
        ) : null}
        {shown.active && shown.role === 'manager' ? (
          <Switch
            label="Sees revenue"
            description="Money taken, on the overview and the Money screen."
            checked={shown.viewRevenue}
            disabled={busy}
            onCheckedChange={(allowed) => { handlers.onPermission(shown, 'view_revenue', allowed); }}
          />
        ) : null}
        {shown.active ? null : (
          <p className="text-small text-grey-700">
            Switched off, they cannot open the school or be booked. Switch them back on and they can teach here again.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** SCH-02: the school's instructors, invitations still waiting, managers, and anybody switched off. */
export function TeamSections({
  members,
  invitations,
  handlers,
}: {
  members: TeamMember[];
  invitations: WaitingInvitation[];
  handlers: TeamHandlers;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const instructors = members.filter((one) => one.active && one.role === 'instructor');
  const managers = members.filter((one) => one.active && one.role === 'manager');
  const switchedOff = members.filter((one) => !one.active);
  // Read from the latest list, so the sheet shows a change as soon as the team is read again.
  const open = members.find((one) => one.membershipId === openId) ?? null;

  const row = (member: TeamMember) => (
    <MemberRow
      member={member}
      manageable={canManage(member, handlers.viewerIsOwner)}
      onOpen={() => { setOpenId(member.membershipId); }}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <Section id="team-instructors" title="Instructors" description="Everybody teaching for the school.">
        {instructors.length === 0 ? (
          <EmptyState icon={Users} title="No instructors yet" description="Invite your instructors and they will appear here once they join." />
        ) : (
          <Rows items={instructors} keyOf={(one) => one.membershipId} render={row} />
        )}
      </Section>

      {invitations.length > 0 ? (
        <Section id="team-invitations" title="Invitations waiting" description="Links sent that nobody has used yet.">
          <Rows
            items={invitations}
            keyOf={(one) => one.invitationId}
            render={(one) => {
              const who = one.fullName ?? contactOf(one) ?? 'Shared as a link';
              return (
                <div className="flex items-center gap-3 px-4 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-ink">{who}</span>
                    <span className="truncate text-small text-grey-700">Works until {one.expiresOn}</span>
                  </div>
                  <StatusPill status="pending">Waiting</StatusPill>
                  <Button
                    variant="tertiary"
                    className="shrink-0 px-2"
                    pending={handlers.busyId === one.invitationId}
                    aria-label={`Cancel the invitation for ${who}`}
                    onClick={() => { handlers.onCancelInvitation(one); }}
                  >
                    Cancel
                  </Button>
                </div>
              );
            }}
          />
        </Section>
      ) : null}

      {managers.length > 0 ? (
        <Section id="team-managers" title="Managers" description="People who help run the school.">
          <Rows items={managers} keyOf={(one) => one.membershipId} render={row} />
        </Section>
      ) : null}

      {switchedOff.length > 0 ? (
        <Section id="team-switched-off" title="Switched off" description="They cannot open the school or be booked. Lessons they had stay in the diary.">
          <Rows items={switchedOff} keyOf={(one) => one.membershipId} render={row} />
        </Section>
      ) : null}

      <MemberSheet member={open} handlers={handlers} onClose={() => { setOpenId(null); }} />
    </div>
  );
}

/** Before somebody is switched off: what happens to them, their profile and their lessons (D-120). */
export function SwitchOffDialog({
  member,
  pending,
  onConfirm,
  onCancel,
}: {
  member: TeamMember | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState<TeamMember | null>(member);
  // Keep the words while the dialog closes, so it does not empty as it fades.
  if (member !== null && member !== shown) setShown(member);
  const who = shown?.name ?? '';
  const lessons = shown?.lessonsToCome ?? 0;

  return (
    <Dialog
      open={member !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={`Switch off ${who}?`}
      description={
        shown?.role === 'manager'
          ? 'They lose the school straight away. You can switch them back on at any time.'
          : "They lose the school's diary and learners straight away, their profile comes off the public site and nobody can book them a new lesson. You can switch them back on at any time."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Keep them
          </Button>
          <Button pending={pending} onClick={onConfirm}>
            Switch off
          </Button>
        </>
      }
    >
      {shown?.role === 'instructor' && lessons > 0 ? (
        <p className="text-body text-ink">
          {lessons === 1 ? 'Their 1 lesson to come stays' : `Their ${String(lessons)} lessons to come stay`} in the diary for you to give to
          another instructor or call off.
        </p>
      ) : null}
    </Dialog>
  );
}
