import type { Metadata } from 'next';
import { teachingMinutes } from '@repo/core/diary';
import { formatCalendarDate, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Users } from 'lucide-react';
import { Suspense } from 'react';
import { hoursTaught } from '@/components/diary/day-view';
import { LessonRow } from '@/components/diary/lesson-row';
import { requirePortal } from '@/lib/auth/session';
import { lessonsBetween, type DiaryEntry } from '@/lib/diary/lessons';
import { dateFrom, step, windowFor } from '@/lib/diary/range';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SchoolDiaryNav } from './school-diary-nav';

export const metadata: Metadata = { title: 'School diary' };

interface SchoolDiaryParams {
  searchParams: Promise<{ date?: string; instructor?: string; transmission?: string }>;
}

export default async function SchoolDiaryPage({ searchParams }: SchoolDiaryParams) {
  const params = await searchParams;
  const date = dateFrom(params.date);

  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Diary" subtitle={formatCalendarDate(date)} />
      <div className="flex flex-col gap-4 px-4 md:px-8">
        <Suspense key={`${date}-${params.instructor ?? ''}-${params.transmission ?? ''}`} fallback={<SkeletonRow />}>
          <SchoolDay date={date} instructor={params.instructor} transmission={params.transmission} />
        </Suspense>
      </div>
    </main>
  );
}

/** DIA-09: every instructor side by side, for one day. */
async function SchoolDay({ date, instructor, transmission }: { date: string; instructor?: string; transmission?: string }) {
  const { access } = await requirePortal('school');
  const business = access.memberships.find((m) => m.businessType === 'school');
  if (!business) return null;

  const supabase = await createSupabaseServerClient();
  const { data: team } = await supabase
    .from('instructor_profiles')
    .select('id, display_name, transmission')
    .eq('business_id', business.businessId)
    .order('display_name');

  const shown = (team ?? []).filter(
    (member) =>
      (instructor === undefined || instructor === '' || member.id === instructor) &&
      (transmission === undefined || transmission === '' || member.transmission === transmission),
  );

  const range = windowFor('day', date);
  const lessons = shown.length > 0 ? await lessonsBetween(range.startsAt, range.endsAt, shown.map((member) => member.id)) : [];
  const byInstructor = new Map<string, DiaryEntry[]>();
  for (const lesson of lessons) {
    const existing = byInstructor.get(lesson.instructorId);
    if (existing) existing.push(lesson);
    else byInstructor.set(lesson.instructorId, [lesson]);
  }

  return (
    <>
      <SchoolDiaryNav
        date={date}
        previous={step('day', date, -1)}
        next={step('day', date, 1)}
        today={todayInZone()}
        instructors={(team ?? []).map((member) => ({ id: member.id, name: member.display_name }))}
        instructor={instructor ?? ''}
        transmission={transmission ?? ''}
      />
      {shown.length === 0 ? (
        <EmptyState icon={Users} title="Nobody matches" description="Change the filters to see your instructors." />
      ) : (
        <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((member) => {
            const theirs = byInstructor.get(member.id) ?? [];
            return (
              <li key={member.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-h3 text-black">{member.display_name}</h2>
                  <span className="text-small text-grey-700">
                    {theirs.length === 0 ? 'Free all day' : hoursTaught(teachingMinutes(theirs)).toLowerCase()}
                  </span>
                </div>
                {theirs.length === 0 ? (
                  <p className="rounded-card border border-dashed border-grey-200 p-3 text-small text-grey-700">
                    Nothing booked
                  </p>
                ) : (
                  <ul className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white">
                    {theirs.map((lesson) => (
                      <li key={lesson.id}>
                        <LessonRow lesson={lesson} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
