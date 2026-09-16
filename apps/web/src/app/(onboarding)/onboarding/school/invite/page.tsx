import { formatUkMobile } from '@repo/core/phone';
import { formatDate } from '@repo/core/time';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSchoolSetup } from '@/lib/onboarding/school-session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SchoolStep } from '../school-step';
import { FinishSetup } from './finish-setup';
import { InviteInstructorsForm } from '@/components/school/invite-instructors-form';
import { inviteInstructor } from '../actions';

export const metadata: Metadata = { title: 'Invite your instructors' };

/** AUTH-05, PRD 10.5 step 3: a link for each instructor, then the school's portal. */
export default function InviteInstructorsPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <InviteInstructors />
    </Suspense>
  );
}

async function InviteInstructors() {
  const session = await requireSchoolSetup('/onboarding/school/invite');
  // The school's details come first: nothing here works without knowing which school it is.
  if (session.basePostcode === null) redirectTo('/onboarding/school');

  return (
    <SchoolStep
      current={2}
      title="Invite your instructors"
      lead={`Each one gets a link to join ${session.name}, then sets up their profile in four short steps. Send it from your phone, the way you already talk to them.`}
    >
      <InviteInstructorsForm invite={inviteInstructor} />
      <Suspense fallback={<SkeletonRow />}>
        <Invited businessId={session.businessId} expected={session.expectedInstructors} />
      </Suspense>
      <FinishSetup />
    </SchoolStep>
  );
}

/** Who has a link so far. Only a hash of each link is kept, so a lost one is sent again as new. */
async function Invited({ businessId, expected }: { businessId: string; expected: number | null }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('invitations')
    .select('id, full_name, email, phone, accepted_at, expires_at, revoked_at')
    .eq('business_id', businessId)
    .eq('kind', 'member')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not read the school's invitations: ${error.message}`);
  if (data.length === 0) return null;

  const now = new Date();
  const count = expected === null ? String(data.length) : `${String(data.length)} of about ${String(expected)}`;

  return (
    <section aria-labelledby="invited-heading" className="flex flex-col gap-2">
      <h2 id="invited-heading" className="text-h3 text-black">
        Invited so far <span className="text-body font-normal text-grey-700">({count})</span>
      </h2>
      <div className="rounded-lg border border-grey-200">
        {data.map((invitation, index) => {
          const expires = new Date(invitation.expires_at);
          const joined = invitation.accepted_at !== null;
          const ended = !joined && (invitation.revoked_at !== null || expires <= now);
          const contact = invitation.phone ? formatUkMobile(invitation.phone) : invitation.email;
          return (
            <div key={invitation.id}>
              {index > 0 ? <ListDivider /> : null}
              <ListRow
                title={invitation.full_name ?? contact ?? 'Shared as a link'}
                subtitle={joined ? 'Has joined' : ended ? 'The link has stopped working' : `Link works until ${formatDate(expires)}`}
                trailing={
                  joined ? (
                    <StatusPill status="completed">Joined</StatusPill>
                  ) : ended ? (
                    <StatusPill status="cancelled">Expired</StatusPill>
                  ) : (
                    <StatusPill status="pending">Waiting</StatusPill>
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
