import type { Metadata } from 'next';
import { resolveBookingRules } from '@repo/core/booking-rules';
import { defaultWorkingHours } from '@repo/core/schemas/onboarding';
import { formatDate, formatTime, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { BookingRulesForm } from './booking-rules';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function Availability() {
  // Upcoming exceptions are relative to now, which a prerendered shell cannot know.
  await connection();
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: hours }, { data: exceptions }, { data: profile }, { data: business }, { data: platform }] =
    await Promise.all([
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
    supabase
      .from('instructor_profiles')
      .select('buffer_minutes, instant_book')
      .eq('id', membership.instructorProfileId)
      .single(),
    supabase.from('businesses').select('settings').eq('id', membership.businessId).single(),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
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

  const rules = resolveBookingRules(
    isRecord(platform?.value) ? platform.value : null,
    isRecord(business?.settings) ? business.settings : null,
    profile ? { bufferMinutes: profile.buffer_minutes, instantBook: profile.instant_book } : null,
  );
  // A school sets the rules for everyone who teaches for it (SCH-04).
  const canSetBusinessRules = membership.role === 'owner' || membership.role === 'manager';

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
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>Booking rules</CardTitle>
          <CardDescription>What a learner can book, and how much notice you need.</CardDescription>
        </div>
        <BookingRulesForm rules={rules} canSetBusinessRules={canSetBusinessRules} />
      </Card>
    </>
  );
}
