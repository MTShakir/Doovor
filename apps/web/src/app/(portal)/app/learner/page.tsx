import type { Metadata } from 'next';
import { splitByCredit } from '@repo/core/credit';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { CalendarDays, CarFront, MapPin } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { ComingSoon } from '@/components/capture/coming-soon';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { SetupCard } from './setup-card';
import { Moves } from './moves';
import { learnerMoves } from '@/lib/learners/moves';
import { requirePortal } from '@/lib/auth/session';
import { myLessons, type MyLesson } from '@/lib/learner/lessons';
import { learnerSetup } from '@/lib/learner/setup';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const { session } = await requirePortal('learner');
  const [{ upcoming, past }, setup, moves] = await Promise.all([myLessons(), learnerSetup(session.userId), learnerMoves()]);
  const next = upcoming[0];

  return (
    <>
      <PageHeader title="Home" subtitle="Your next lesson, and how to get to it." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        {/* D-292: a choice waiting on them comes first, as nothing moves until they make it. */}
        <Moves moves={moves} />
        <SetupCard setup={setup} />
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
            <NextLessonMoney lesson={next} />
            <Button asChild width="responsive" variant={payFor(next) === null ? 'primary' : 'secondary'}>
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
        {upcoming.length === 0 && past.length === 0 ? <FindAnInstructor userId={session.userId} email={session.email} /> : null}
        <InstallPrompt why="Your lessons, payments and progress, one tap away." />
      </div>
    </>
  );
}

/**
 * What is left to do about the next lesson's money, in the words its own row on Lessons uses
 * (PAY-03, D-318, D-337): a time held only while it is paid for is lost if nobody pays, so the
 * home screen says so rather than leaving it to be found. Null when there is nothing to do.
 */
function payFor(lesson: MyLesson): { line: string | null; button: string } | null {
  if (!lesson.canPayNow) return null;
  const owed = formatPence(
    splitByCredit({ minutes: lesson.durationMinutes, pricePence: lesson.pricePence, availableMinutes: lesson.creditMinutes }).owedPence,
  );
  if (lesson.status === 'pending_payment') return { line: 'This time is held for you while you pay for it.', button: 'Pay to confirm it' };
  if (lesson.status === 'requested') return { line: `${lesson.instructorName} has still to accept.`, button: `Authorise ${owed}` };
  if (lesson.paymentMode === 'before_lesson' && lesson.paymentStatus === 'unpaid') return { line: null, button: 'Set up payment' };
  return { line: null, button: `Pay ${owed}` };
}

function NextLessonMoney({ lesson }: { lesson: MyLesson }) {
  const pay = payFor(lesson);
  if (pay === null) return null;
  return (
    <>
      {pay.line === null ? null : <p className="text-body text-ink">{pay.line}</p>}
      <Button asChild width="responsive">
        <Link href={`/app/learner/pay/${lesson.id}`}>{pay.button}</Link>
      </Button>
    </>
  );
}

/**
 * A learner with no lessons yet may have no instructor either: where learners cannot yet find one
 * in the app, they can join their area's waiting list or post a lesson request (MKT-10, M5-10).
 */
async function FindAnInstructor({ userId, email }: { userId: string; email: string | null }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('users').select('full_name').eq('id', userId).maybeSingle();
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>Looking for an instructor?</CardTitle>
        <CardDescription>Finding instructors near you in the app is coming soon. Check your area to hear when it opens.</CardDescription>
      </div>
      <ComingSoon prefill={{ ...(data?.full_name ? { fullName: data.full_name } : {}), ...(email ? { email } : {}) }} />
    </Card>
  );
}
