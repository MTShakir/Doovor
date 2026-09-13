import type { Metadata } from 'next';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CalendarDays, CarFront, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { myLessons } from '@/lib/learner/lessons';

export const metadata: Metadata = { title: 'Home' };

export default function LearnerHomePage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <Suspense fallback={<SkeletonRow />}>
        <Home />
      </Suspense>
    </main>
  );
}

/** PRD 8.2: the one thing a learner opens the app for is when their next lesson is. */
async function Home() {
  await requirePortal('learner');
  const { upcoming, past } = await myLessons();
  const next = upcoming[0];

  return (
    <>
      <PageHeader title="Home" subtitle="Your next lesson, and how to get to it." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        {next ? (
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>
                {formatDate(new Date(next.startsAt))} at {formatTime(new Date(next.startsAt))}
              </CardTitle>
              <CardDescription>
                {formatMinutes(next.durationMinutes)} with {next.instructorName}
              </CardDescription>
            </div>
            {next.pickup === null ? null : (
              <p className="flex items-center gap-2 text-body text-ink">
                <MapPin className="size-5 shrink-0 text-grey-700" aria-hidden />
                {next.pickup}
              </p>
            )}
            <Button asChild width="responsive">
              <Link href="/app/learner/lessons">
                <CalendarDays className="size-5" aria-hidden />
                See all my lessons
              </Link>
            </Button>
          </Card>
        ) : (
          <Card padding="none">
            <EmptyState
              icon={CarFront}
              title="No lessons booked"
              description={
                past.length === 0
                  ? 'Your instructor will book your first one, or send you a link to book it yourself.'
                  : 'Ask your instructor for another, or use the link they sent you.'
              }
              action={
                <Button asChild width="full">
                  <Link href="/app/learner/lessons">See my lessons</Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>
    </>
  );
}
