'use client';

import { inviteKindsFor, type LessonSeller, type MemberPermission } from '@repo/core/schemas/school';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { InviteInstructorsForm } from '@/components/school/invite-instructors-form';
import { LetGoDialog, SwitchOffDialog, TeamSections } from '@/components/school/team';
import type { LinkedInstructor, SchoolTeam, TeamMember } from '@/lib/school/team';
import { cancelInvitation, changePermission, inviteToSchool, letGo, switchMember } from './actions';

/** SCH-02: the school's team, and the one button that invites somebody to it. */
export function TeamScreen({
  team,
  viewerIsOwner,
  lessonSeller = 'school',
}: {
  team: SchoolTeam;
  viewerIsOwner: boolean;
  lessonSeller?: LessonSeller | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // An instructor, or, for the owner alone, a manager (D-293).
  const [inviting, setInviting] = useState<'instructor' | 'manager' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [switchingOff, setSwitchingOff] = useState<TeamMember | null>(null);
  const [lettingGo, setLettingGo] = useState<LinkedInstructor | null>(null);
  const kinds = inviteKindsFor(lessonSeller);
  const teaching = team.members.filter((one) => one.active && one.role === 'instructor').length + team.linked.length;

  /** Runs one change, says what went wrong if it did, and reads the team again either way. */
  const change = (id: string, work: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await work();
      toast(result.ok ? done : result.message);
      setBusyId(null);
      setSwitchingOff(null);
      setLettingGo(null);
      router.refresh();
    });
  };

  const onPermission = (member: TeamMember, permission: MemberPermission, allowed: boolean) => {
    const words =
      permission === 'set_own_prices'
        ? allowed
          ? `${member.name} sets their own prices`
          : `${member.name} teaches at the school's prices`
        : allowed
          ? `${member.name} sees revenue`
          : `${member.name} no longer sees revenue`;
    change(member.membershipId, () => changePermission({ membershipId: member.membershipId, permission, allowed }), words);
  };

  const onSwitch = (member: TeamMember, active: boolean) => {
    if (!active) {
      setSwitchingOff(member);
      return;
    }
    change(member.membershipId, () => switchMember({ membershipId: member.membershipId, active: true }), `${member.name} is switched back on`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-small text-grey-700" aria-live="polite">
          {teaching === 1 ? '1 instructor' : `${String(teaching)} instructors`}
        </p>
        <div className="flex flex-col gap-2 md:flex-row">
          {viewerIsOwner ? (
            <Button variant="secondary" width="responsive" onClick={() => { setInviting('manager'); }}>
              Invite a manager
            </Button>
          ) : null}
          <Button width="responsive" onClick={() => { setInviting('instructor'); }}>
            <UserPlus className="size-5" aria-hidden />
            Invite an instructor
          </Button>
        </div>
      </div>

      <TeamSections
        members={team.members}
        linked={team.linked}
        invitations={team.invitations}
        lessonSeller={lessonSeller}
        handlers={{
          viewerIsOwner,
          busyId,
          onPermission,
          onSwitch,
          onCancelInvitation: (invitation) => {
            change(invitation.invitationId, () => cancelInvitation(invitation.invitationId), 'Invitation cancelled. The link no longer works');
          },
          onLetGo: setLettingGo,
        }}
      />

      <LetGoDialog
        linked={lettingGo}
        pending={lettingGo !== null && busyId === lettingGo.linkId}
        onCancel={() => { setLettingGo(null); }}
        onConfirm={() => {
          if (!lettingGo) return;
          const linked = lettingGo;
          change(linked.linkId, () => letGo(linked.linkId), `${linked.name} is no longer linked`);
        }}
      />

      <SwitchOffDialog
        member={switchingOff}
        pending={switchingOff !== null && busyId === switchingOff.membershipId}
        onCancel={() => { setSwitchingOff(null); }}
        onConfirm={() => {
          if (!switchingOff) return;
          const member = switchingOff;
          change(member.membershipId, () => switchMember({ membershipId: member.membershipId, active: false }), `${member.name} is switched off`);
        }}
      />

      <Sheet
        open={inviting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInviting(null);
            // Whoever was just invited shows under Invitations waiting.
            router.refresh();
          }
        }}
        title={inviting === 'manager' ? 'Invite a manager' : 'Invite an instructor'}
        description={
          inviting === 'manager'
            ? 'They get a link to help run the school: its instructors, bookings, prices and learners. They see its revenue only if you let them.'
            : kinds.length === 2
              ? 'They get a link to join the school, or to link their own business to it.'
              : kinds.includes('link')
                ? 'They get a link to link their own business to the school, keeping their prices, payments and learners.'
                : 'They get a link to join the school and set up their profile in four short steps.'
        }
      >
        <InviteInstructorsForm key={inviting ?? 'none'} invite={inviteToSchool} kinds={inviting === 'manager' ? ['manager'] : kinds} />
      </Sheet>
    </div>
  );
}
