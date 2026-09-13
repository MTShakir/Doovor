import type { Metadata } from 'next';
import { resolveBookingRules } from '@repo/core/booking-rules';
import { byDay } from '@repo/core/diary';
import { formatCalendarDate, formatDate, isoWeekday, localToUtc, todayInZone, utcToLocal } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { DayView } from '@/components/diary/day-view';
import { LiveDiary } from '@/components/diary/live-diary';
import { MonthView } from '@/components/diary/month-view';
import { WeekView } from '@/components/diary/week-view';
import { requirePortal } from '@/lib/auth/session';
import { lessonsBetween } from '@/lib/diary/lessons';
import { dateFrom, isDiaryView, step, windowFor, type ChosenView } from '@/lib/diary/range';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { bookableLearners } from '@/lib/booking/learners';
import { BookLesson } from '../book-lesson';
import { DiaryNav } from './diary-nav';

export const metadata: Metadata = { title: 'Diary' };

interface DiaryParams {
  searchParams: Promise<{ view?: string; date?: string }>;
}

/**
 * A diary is about now: the day asked for, or today. None of it can be prerendered, so all
 * of it sits inside one boundary and the shell around it stays instant (D-029).
 */
export default function DiaryPage({ searchParams }: DiaryParams) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <Diary searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Diary({ searchParams }: DiaryParams) {
  const params = await searchParams;
  const view: ChosenView = isDiaryView(params.view) ? params.view : 'responsive';
  const date = dateFrom(params.date);
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((m) => m.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;

  const range = windowFor(view, date);
  const [lessons, hours, learners, rules] = await Promise.all([
    lessonsBetween(range.startsAt, range.endsAt, [membership.instructorProfileId]),
    workingHours(membership.instructorProfileId),
    bookableLearners(membership.instructorProfileId),
    businessRules(membership.instructorProfileId),
  ]);

  const worked = hours.get(isoWeekday(date));
  const opens = worked ? localToUtc(date, worked.start) : null;
  const closes = worked ? localToUtc(date, worked.end) : null;

  const dayOf = (instant: Date) => utcToLocal(instant).date;
  const onThisDay = lessons.filter((lesson) => dayOf(lesson.startsAt) === date);
  const day = <DayView lessons={onThisDay} opens={opens} closes={closes} canAnswer rules={rules} />;
  const week = <WeekView from={range.from} lessons={lessons} dayOf={dayOf} today={todayInZone()} />;

  return (
    <>
      <PageHeader title="Diary" subtitle={formatCalendarDate(date)} />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        {learners.length > 0 ? <BookLesson learners={learners} date={date} /> : null}
        <DiaryNav
          view={view}
          date={date}
          previous={step(view, date, -1)}
          next={step(view, date, 1)}
          today={todayInZone()}
        />
        <section aria-label={`Diary for ${formatDate(range.startsAt)}`}>
          <LiveDiary instructorIds={[membership.instructorProfileId]} />
          {view === 'day' ? day : null}
          {view === 'week' ? week : null}
          {view === 'month' ? (
            <MonthView month={range.from} today={todayInZone()} busy={[...byDay(lessons, dayOf).keys()]} />
          ) : null}
          {view === 'responsive' ? (
            <>
              <div className="md:hidden">{day}</div>
              <div className="hidden md:block">{week}</div>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}

/** The hours worked, by weekday, so the day view knows when the gaps are (DIA-01). */
async function workingHours(instructorId: string): Promise<Map<number, { start: string; end: string }>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('working_hours')
    .select('weekday, start_time, end_time')
    .eq('instructor_id', instructorId);
  return new Map(
    (data ?? []).map((row) => [row.weekday, { start: row.start_time.slice(0, 5), end: row.end_time.slice(0, 5) }]),
  );
}

/** What a cancellation would mean here, for the warning before one (R-06, BOK-09). */
async function businessRules(instructorProfileId: string): Promise<{
  cancellationWindowHours: number;
  lateFeePercent: number;
}> {
  const supabase = await createSupabaseServerClient();
  const [profile, platform] = await Promise.all([
    supabase
      .from('instructor_profiles')
      .select('buffer_minutes, instant_book, businesses!instructor_profiles_business_id_fkey(settings)')
      .eq('id', instructorProfileId)
      .maybeSingle(),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
  ]);

  const rules = resolveBookingRules(
    platform.data?.value as Record<string, unknown> | null,
    profile.data?.businesses.settings as Record<string, unknown> | null,
    { bufferMinutes: profile.data?.buffer_minutes, instantBook: profile.data?.instant_book },
  );
  return { cancellationWindowHours: rules.cancellationWindowHours, lateFeePercent: rules.lateFeePercent };
}
