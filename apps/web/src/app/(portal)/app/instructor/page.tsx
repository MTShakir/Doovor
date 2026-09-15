import { setupComplete, type SetupState } from '@repo/core/setup-checklist';
import { formatDateWithYear } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CalendarX } from 'lucide-react';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { TodayLessons } from '@/components/lessons/today-lessons';
import { SetupChecklist } from '@/components/setup-checklist';
import { requirePortal } from '@/lib/auth/session';
import { teachingProfiles, todaysLessons } from '@/lib/lessons/teaching';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default function InstructorHomePage() {
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
        <Suspense fallback={<SkeletonRow />}>
          <Lessons />
        </Suspense>
      </div>
    </main>
  );
}

/** Today's lessons, and the one to start next (PRD 7.5, 10.2, M4-04). */
async function Lessons() {
  const { access } = await requirePortal('instructor');
  const now = new Date();
  const lessons = await todaysLessons(teachingProfiles(access), now);
  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="No lessons today"
        description="Lessons you book for today show up here, with where to pick each learner up."
      />
    );
  }
  return <TodayLessons lessons={lessons} now={now.toISOString()} />;
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
      .select('verification_status, is_listed')
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
      .eq('status', 'active'),
  ]);

  const state: SetupState = {
    learners: learners ?? 0,
    paymentsConnected: business?.stripe_charges_enabled ?? false,
    verified: profile?.verification_status === 'approved',
    listed: profile?.is_listed ?? true,
  };

  return setupComplete(state) ? null : <SetupChecklist state={state} />;
}
