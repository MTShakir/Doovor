'use client';

import type { MemberPermission } from '@repo/core/schemas/school';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { InviteInstructorsForm } from '@/components/school/invite-instructors-form';
import { SwitchOffDialog, TeamSections } from '@/components/school/team';
import type { SchoolTeam, TeamMember } from '@/lib/school/team';
import { cancelInvitation, changePermission, inviteToSchool, switchMember } from './actions';

/** SCH-02: the school's team, and the one button that invites somebody to it. */
export function TeamScreen({ team, viewerIsOwner }: { team: SchoolTeam; viewerIsOwner: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [switchingOff, setSwitchingOff] = useState<TeamMember | null>(null);

  /** Runs one change, says what went wrong if it did, and reads the team again either way. */
  const change = (id: string, work: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await work();
      toast(result.ok ? done : result.message);
      setBusyId(null);
      setSwitchingOff(null);
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
          {team.members.filter((one) => one.active && one.role === 'instructor').length === 1
            ? '1 instructor'
            : `${String(team.members.filter((one) => one.active && one.role === 'instructor').length)} instructors`}
        </p>
        <Button width="responsive" onClick={() => { setInviting(true); }}>
          <UserPlus className="size-5" aria-hidden />
          Invite an instructor
        </Button>
      </div>

      <TeamSections
        members={team.members}
        invitations={team.invitations}
        handlers={{
          viewerIsOwner,
          busyId,
          onPermission,
          onSwitch,
          onCancelInvitation: (invitation) => {
            change(invitation.invitationId, () => cancelInvitation(invitation.invitationId), 'Invitation cancelled. The link no longer works');
          },
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
        open={inviting}
        onOpenChange={(open) => {
          setInviting(open);
          // Whoever was just invited shows under Invitations waiting.
          if (!open) router.refresh();
        }}
        title="Invite an instructor"
        description="They get a link to join the school and set up their profile in four short steps."
      >
        <InviteInstructorsForm invite={inviteToSchool} />
      </Sheet>
    </div>
  );
}
