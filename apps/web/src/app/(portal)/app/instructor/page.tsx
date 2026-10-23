import type { Metadata } from 'next';
import { setupComplete, type SetupState } from '@repo/core/setup-checklist';
import { formatDateWithYear } from '@repo/core/time';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { TodayLessonsLive } from '@/components/lessons/today-lessons-live';
import { UpcomingLessons } from '@/components/lessons/upcoming-lessons';
import { WaitingRequests } from '@/components/lessons/waiting-requests';
import { InstructorStatsCard } from '@/components/instructor/stats';
import { instructorStats } from '@/lib/instructor/dashboard';
import { statsSpanFrom } from '@/lib/instructor/spans';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { SetupChecklist } from '@/components/setup-checklist';
import { requirePortal } from '@/lib/auth/session';
import { requestsWaiting, teachingProfiles, todaysLessons, upcomingLessons } from '@/lib/lessons/teaching';
import { upcomingCount } from '@/lib/lessons/upcoming';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Today' };

interface TodayProps {
  searchParams: Promise<{ upcoming?: string; stats?: string }>;
}

export default function InstructorHomePage({ searchParams }: TodayProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Today"
        subtitle={
          <Suspense fallback={null}>
            <TodayDate />
          </Suspense>
        }
      />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Setup />
        </Suspense>
        {/* A request nobody answers runs out, so the ones waiting come first (BOK-06, D-379). */}
        <Suspense fallback={null}>
          <Requests />
        </Suspense>
        {/*
          UX: today's lessons come before the week's takings.
          PRD 7.5 calls this screen "a vertical timeline of today's lessons" and does not mention
          the takings at all. An instructor opens this between lessons, standing by the car, and
          wants who is next; what the week earned is a sit-down-on-Sunday question. It also used to
          be the only block on the screen with no heading, while the less urgent one below it had
          one, so the most important thing was the hardest to find.
        */}
        <section aria-labelledby="today-title" className="flex flex-col gap-2">
          <h2 id="today-title" className="text-h3 text-black">
            Today&rsquo;s lessons
          </h2>
          <Suspense fallback={<SkeletonRow />}>
            <Lessons />
          </Suspense>
        </section>
        <section aria-labelledby="upcoming-title" className="flex flex-col gap-2">
          <h2 id="upcoming-title" className="text-h3 text-black">
            Upcoming lessons
          </h2>
          <Suspense fallback={<SkeletonRow />}>
            <Upcoming searchParams={searchParams} />
          </Suspense>
        </section>
        <Suspense fallback={<SkeletonRow />}>
          <Stats searchParams={searchParams} />
        </Suspense>
        <InstallPrompt why="It opens in one tap, and Today still opens where there is no signal." />
      </div>
    </main>
  );
}

/** Today's lessons, and the one to start next (PRD 7.5, 10.2, M4-04). */
async function Lessons() {
  const { access } = await requirePortal('instructor');
  const now = new Date();
  const lessons = await todaysLessons(teachingProfiles(access), now);
  // With no signal, the list draws itself from the phone's copy of the day (M4-10).
  return <TodayLessonsLive lessons={lessons} now={now.toISOString()} />;
}

/** Lessons asked for and not answered yet (BOK-06, R-12, D-379). */
async function Requests() {
  const { access } = await requirePortal('instructor');
  return <WaitingRequests requests={await requestsWaiting(teachingProfiles(access))} />;
}

/** The next lessons after today, five at a time (DIA-04, D-167). */
async function Upcoming({ searchParams }: TodayProps) {
  const shown = upcomingCount((await searchParams).upcoming);
  const { access } = await requirePortal('instructor');
  const { lessons, more } = await upcomingLessons(teachingProfiles(access), shown);
  return <UpcomingLessons lessons={lessons} more={more} shown={shown} />;
}

/** How the week or month is going (MNY-01, D-177). */
async function Stats({ searchParams }: TodayProps) {
  await requirePortal('instructor');
  const stats = await instructorStats(statsSpanFrom((await searchParams).stats));
  return stats === null ? null : <InstructorStatsCard stats={stats} />;
}

/** Today's date is not something a shell can be prerendered with (Cache Components). */
async function TodayDate() {
  await connection();
  return formatDateWithYear(new Date());
}

/** Everything on the card is worked out from real rows (PRD 10.1, M1-10). */
async function Setup() {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: business }, { count: learners }] = await Promise.all([
    supabase
      .from('instructor_profiles')
      .select('verification_status, badge_expiry, qualification, supervisor_business_id, supervisor_instructor_id')
      .eq('id', membership.instructorProfileId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('stripe_charges_enabled')
      .eq('id', membership.businessId)
      .maybeSingle(),
    supabase
      .from('learner_relationships')
      .select('learner_id', { count: 'exact', head: true })
      .eq('instructor_id', membership.instructorProfileId)
      // Anybody on the list, invited or added: somebody who joined from an invitation is an
      // enquiry until their first lesson, and is still the first learner on board (D-382).
      .neq('status', 'left'),
  ]);

  const state: SetupState = {
    learners: learners ?? 0,
    paymentsConnected: business?.stripe_charges_enabled ?? false,
    verified: profile?.verification_status === 'approved',
    badgeToSend: profile?.verification_status === 'unsubmitted' || profile?.verification_status === 'rejected',
    badgeInDate: !profile?.badge_expiry || profile.badge_expiry >= todayInZone(),
    // A trainee is booked only while somebody supervises them (R-18, D-343).
    supervised:
      profile?.qualification !== 'pdi' || profile.supervisor_business_id !== null || profile.supervisor_instructor_id !== null,
    // The school takes the payments for somebody teaching under it; its owner connects them.
    paymentsAreTheSchools: membership.businessType === 'school' && membership.role !== 'owner',
  };

  return setupComplete(state) ? null : <SetupChecklist state={state} />;
}
