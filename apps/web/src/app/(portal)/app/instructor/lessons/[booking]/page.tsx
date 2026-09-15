import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import { LessonScreen } from '@/components/lessons/lesson-screen';
import { requirePortal } from '@/lib/auth/session';
import { lessonHasEnded, lessonTaughtBy, teachingProfiles } from '@/lib/lessons/teaching';

export const metadata: Metadata = { title: 'Lesson', robots: { index: false } };

interface LessonPageProps {
  params: Promise<{ booking: string }>;
  searchParams: Promise<{ record?: string }>;
}

/** A lesson being taught, or its record being written (PRD 7.5, 10.2, M4-04, M4-05). */
export default function LessonPage({ params, searchParams }: LessonPageProps) {
  return (
    <main className="flex flex-col pb-8">
      <Suspense fallback={<div className="px-4 pt-4 md:px-8"><SkeletonRow /></div>}>
        <Lesson params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Lesson({ params, searchParams }: LessonPageProps) {
  const [{ booking }, { record }] = await Promise.all([params, searchParams]);
  const { access } = await requirePortal('instructor');
  if (!z.uuid().safeParse(booking).success) notFound();

  // Only the instructor teaching it: anybody else, the people who run a school included, has no
  // lesson here to teach or record (PRD 6.2).
  const lesson = await lessonTaughtBy(booking, teachingProfiles(access));
  if (lesson === null) notFound();

  const status = lesson.facts.status;
  if (lesson.recorded || !['confirmed', 'in_progress', 'completed'].includes(status)) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-4 md:max-w-2xl md:px-8 md:pt-8">
        <h1 className="text-h1 text-black">{lesson.learnerName}</h1>
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="size-6 shrink-0 text-black" aria-hidden />
            <CardTitle>{lesson.recorded ? 'Record saved' : 'This lesson is not going ahead'}</CardTitle>
          </div>
          <CardDescription>
            {lesson.recorded ? 'This lesson already has its record.' : 'A lesson that was called off, or nobody came to, has no record.'}
          </CardDescription>
          <Button asChild variant="secondary" width="responsive">
            <Link href="/app/instructor">Back to Today</Link>
          </Button>
        </Card>
      </div>
    );
  }

  // A lesson that has ended is recorded, not taught.
  return <LessonScreen lesson={lesson} startOnRecord={record === '1' || status === 'completed' || lessonHasEnded(lesson)} />;
}
