import type { Metadata } from 'next';
import { resolveBookingRules } from '@repo/core/booking-rules';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/tabs';
import { CalendarX } from 'lucide-react';
import { Fragment, Suspense } from 'react';
import { LessonsCalendar } from '@/components/lessons/lessons-calendar';
import { requirePortal } from '@/lib/auth/session';
import { myLessons, type MyLesson } from '@/lib/learner/lessons';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MyLessonRow } from './my-lesson';

export const metadata: Metadata = { title: 'Lessons' };

export default function LessonsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Lessons" subtitle="What is booked, and what you have had." />
      <div className="flex flex-col gap-6 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Lessons />
        </Suspense>
      </div>
    </main>
  );
}

/**
 * PRD 8.2: the learner's own lessons, and the two things they may do to one. What is to come shows
 * as a list or on a month calendar (D-170); what has happened is under both.
 */
async function Lessons() {
  await requirePortal('learner');
  const { upcoming, past } = await myLessons();
  const now = new Date();
  const rules = await rulesFor(upcoming[0] ?? past[0]);
  const toCome = (lesson: MyLesson) => <MyLessonRow lesson={lesson} rules={rules} now={now.toISOString()} canChange />;

  return (
    <>
      <Tabs defaultValue="list" className="flex flex-col gap-4">
        <TabsList aria-label="Lessons to come" className="w-full md:w-96">
          <TabsTrigger value="list">Coming up</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="list" className="pt-0">
          {upcoming.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={CalendarX}
                title="No lessons booked"
                description="When your instructor books one, or you do, it appears here."
              />
            </Card>
          ) : (
            <Card padding="none">
              {upcoming.map((lesson, index) => (
                <Fragment key={lesson.id}>
                  {index === 0 ? null : <ListDivider />}
                  {toCome(lesson)}
                </Fragment>
              ))}
            </Card>
          )}
        </TabsContent>
        <TabsContent value="calendar" className="pt-0">
          <LessonsCalendar
            today={todayInZone(now)}
            lessons={upcoming.map((lesson) => ({ id: lesson.id, startsAt: lesson.startsAt, row: toCome(lesson) }))}
          />
        </TabsContent>
      </Tabs>

      {past.length === 0 ? null : (
        <section className="flex flex-col gap-2" aria-labelledby="past-lessons">
          <h2 id="past-lessons" className="text-h3 text-black">
            Before now
          </h2>
          <Card padding="none">
            {past.slice(0, 20).map((lesson, index) => (
              <Fragment key={lesson.id}>
                {index === 0 ? null : <ListDivider />}
                <MyLessonRow lesson={lesson} rules={rules} now={now.toISOString()} canChange={false} />
              </Fragment>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}

/** The rules that apply to this learner's instructor, for the warning before cancelling. */
async function rulesFor(lesson: MyLesson | undefined): Promise<{
  cancellationWindowHours: number;
  lateFeePercent: number;
}> {
  if (!lesson) return { cancellationWindowHours: 48, lateFeePercent: 100 };

  const supabase = await createSupabaseServerClient();
  const [profile, platform] = await Promise.all([
    supabase
      .from('instructor_profiles')
      .select('buffer_minutes, instant_book, businesses!instructor_profiles_business_id_fkey(settings)')
      .eq('id', lesson.instructorId)
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
