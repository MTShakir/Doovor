import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { ChevronLeft, ExternalLink, UserRound } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { myLesson } from '@/lib/learner/lessons';
import { myPickupPoints } from '@/lib/pickup/list';
import { LessonPickup } from './lesson-pickup';

export const metadata: Metadata = { title: 'Lesson', robots: { index: false } };

interface LessonPageProps {
  params: Promise<{ booking: string }>;
}

/** A learner's own lesson: where it starts, and who is teaching it (PRD 8.2, COV-04, D-185). */
export default function MyLessonPage({ params }: LessonPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<div className="px-4 pt-4 md:px-8"><SkeletonRow /></div>}>
        <Lesson params={params} />
      </Suspense>
    </main>
  );
}

async function Lesson({ params }: LessonPageProps) {
  const { booking } = await params;
  const { session } = await requirePortal('learner');
  if (!z.uuid().safeParse(booking).success) notFound();

  // Only their own: anybody else's lesson is simply not there, which is the policies' answer.
  const lesson = await myLesson(booking);
  if (lesson === null) notFound();
  const places = await myPickupPoints(session.userId);

  const startsAt = new Date(lesson.startsAt);
  // The loader reads the status back as text; the words for it are the diary's, as the card's are.
  const facts = {
    status: lesson.status as never,
    paymentStatus: lesson.paymentStatus as never,
    kind: 'standard' as const,
    // So the pill can say a lesson was paid two ways (D-225).
    creditMinutes: lesson.creditMinutes,
  };

  return (
    <>
      <PageHeader
        title={`${formatDate(startsAt)}, ${formatTime(startsAt)}`}
        subtitle={`${formatMinutes(lesson.durationMinutes)} with ${lesson.instructorName}. ${lesson.lessonType}.`}
        back={
          <Link
            href="/app/learner/lessons"
            className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            My lessons
          </Link>
        }
      />

      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusPill status={lessonState(facts)}>{lessonStateLabel(facts)}</StatusPill>
          <span className="text-body font-semibold text-black tabular-nums">{formatPence(lesson.pricePence)}</span>
        </div>

        <Card className="flex flex-col gap-3" role="region" aria-labelledby="pickup-title">
          <CardTitle id="pickup-title">Where you are collected</CardTitle>
          {/* Said in full only where it cannot be chosen: the chooser below says it otherwise. */}
          {lesson.pickup === null || lesson.changeable ? null : (
            <p className="text-body text-ink">
              {lesson.pickup}
              {lesson.pickupAddress === null && lesson.pickupPostcode === null ? null : (
                <span className="block text-small text-grey-700">
                  {[lesson.pickupAddress, lesson.pickupPostcode].filter((part) => part !== null && part !== '').join(', ')}
                </span>
              )}
            </p>
          )}
          <LessonPickup
            bookingId={lesson.id}
            chosen={lesson.pickupPointId}
            changeable={lesson.changeable}
            places={places.map((place) => ({
              id: place.id,
              label: place.label,
              where: [place.address, place.postcode].filter((part) => part !== null && part !== '').join(', '),
            }))}
          />
        </Card>

        <Card className="flex flex-col gap-3" role="region" aria-labelledby="teacher-title">
          <CardTitle id="teacher-title">Who is teaching you</CardTitle>
          <p className="flex items-center gap-2 text-body text-ink">
            <UserRound className="size-5 shrink-0 text-grey-700" aria-hidden />
            {lesson.instructorName}
            {lesson.businessName === lesson.instructorName ? null : (
              <span className="text-small text-grey-700">at {lesson.businessName}</span>
            )}
          </p>
          <div className="flex flex-col gap-2">
            {lesson.instructorProfile === null ? null : (
              <Link
                href={lesson.instructorProfile as Route}
                className="flex h-12 w-fit items-center gap-2 rounded-full text-body font-semibold text-black underline-offset-4 hover:underline"
              >
                <ExternalLink className="size-5" aria-hidden />
                See {lesson.instructorName}&apos;s profile
              </Link>
            )}
            {lesson.schoolProfile === null ? null : (
              <Link
                href={lesson.schoolProfile as Route}
                className="flex h-12 w-fit items-center gap-2 rounded-full text-body font-semibold text-black underline-offset-4 hover:underline"
              >
                <ExternalLink className="size-5" aria-hidden />
                See {lesson.businessName}
              </Link>
            )}
            {lesson.instructorProfile === null && lesson.schoolProfile === null ? (
              <p className="text-small text-grey-700">They have no public profile yet.</p>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
