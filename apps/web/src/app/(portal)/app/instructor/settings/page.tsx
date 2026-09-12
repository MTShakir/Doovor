import type { Metadata } from 'next';
import { defaultWorkingHours } from '@repo/core/schemas/onboarding';
import { formatDate, formatTime, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Exceptions, type ExceptionRow } from './exceptions';
import { WorkingWeek, type WorkingDayValue } from './working-week';

export const metadata: Metadata = { title: 'Diary settings' };

export default function InstructorSettingsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Settings" subtitle="When you work, and when you do not." />
      <div className="flex max-w-2xl flex-col gap-5 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Availability />
        </Suspense>
      </div>
    </main>
  );
}

async function Availability() {
  // Upcoming exceptions are relative to now, which a prerendered shell cannot know.
  await connection();
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: hours }, { data: exceptions }] = await Promise.all([
    supabase
      .from('working_hours')
      .select('weekday, start_time, end_time')
      .eq('instructor_id', membership.instructorProfileId)
      .order('weekday'),
    supabase
      .from('availability_exceptions')
      .select('id, kind, starts_at, ends_at, reason')
      .eq('instructor_id', membership.instructorProfileId)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at')
      .limit(20),
  ]);

  const saved = new Map((hours ?? []).map((row) => [row.weekday, row]));
  const days: WorkingDayValue[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const row = saved.get(weekday);
    return {
      weekday,
      working: row !== undefined,
      // Times come back as 09:00:00; the field wants 09:00.
      startTime: row ? row.start_time.slice(0, 5) : defaultWorkingHours.startTime,
      endTime: row ? row.end_time.slice(0, 5) : defaultWorkingHours.endTime,
    };
  });

  const rows: ExceptionRow[] = (exceptions ?? []).map((row) => {
    const starts = new Date(row.starts_at);
    const ends = new Date(row.ends_at);
    return {
      id: row.id,
      kind: row.kind,
      when: `${formatDate(starts)}, ${formatTime(starts)} to ${formatTime(ends)}`,
      reason: row.reason,
    };
  });

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Your usual week</CardTitle>
          <CardDescription>Learners can book inside these hours.</CardDescription>
        </div>
        <WorkingWeek days={days} />
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Time off and extra hours</CardTitle>
          <CardDescription>One-off changes to the week above.</CardDescription>
        </div>
        <Exceptions rows={rows} today={todayInZone()} />
      </Card>
    </>
  );
}
