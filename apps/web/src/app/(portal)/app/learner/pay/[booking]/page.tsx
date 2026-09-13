import { cardExpiry, describeCard } from '@repo/core/cards';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { CalendarCheck, CalendarX, Clock } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { checkoutLesson, type CheckoutLesson } from '@/lib/payments/checkout';
import { PayLesson } from './pay-lesson';

export const metadata: Metadata = { title: 'Pay for your lesson', robots: { index: false } };

export default function PayPage({ params }: { params: Promise<{ booking: string }> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Pay for your lesson" />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Checkout params={params} />
        </Suspense>
      </div>
    </main>
  );
}

/** Where a lesson stands with its money, which decides everything else on the screen. */
type Stage = 'gone' | 'paid' | 'authorised' | 'capturing' | 'request' | 'due';

function stageOf(lesson: CheckoutLesson): Stage {
  if (lesson.paid) return 'paid';
  if (['expired', 'cancelled', 'declined'].includes(lesson.status)) return 'gone';
  if (lesson.authorised) return lesson.status === 'requested' ? 'authorised' : 'capturing';
  return lesson.status === 'requested' ? 'request' : 'due';
}

function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-body text-ink">
      <span className="mt-0.5 flex shrink-0 text-grey-700">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

function LessonsButton() {
  return (
    <Button asChild width="responsive">
      <Link href="/app/learner/lessons">See your lessons</Link>
    </Button>
  );
}

/** PAY-02, PAY-03, R-10, R-12: what is being paid for, and the one button that does it. */
async function Checkout({ params }: { params: Promise<{ booking: string }> }) {
  // Somebody's own lesson and the state of their payment, which no shell can know.
  await connection();
  await requirePortal('learner');
  const { booking } = await params;
  const lesson = await checkoutLesson(booking);
  if (!lesson) notFound();

  const stage = stageOf(lesson);
  const startsAt = new Date(lesson.startsAt);
  const price = formatPence(lesson.pricePence);
  const iconClass = 'size-5';

  // Cards kept with this Business, which only the provider holds (PAY-02, M3-07).
  const payable = (stage === 'due' || stage === 'request') && lesson.accountId !== null;
  const kept = payable ? await keptCardsWith(lesson.businessId) : null;
  const savedCards = (kept?.cards ?? []).map((card) => ({
    paymentMethodId: card.paymentMethodId,
    label: describeCard(card),
    expiry: cardExpiry(card),
  }));

  const pill = {
    gone: lesson.status === 'expired' ? <StatusPill status="pending">Slot gone</StatusPill> : <StatusPill status="cancelled" />,
    paid: <StatusPill status="paid">Paid</StatusPill>,
    authorised: <StatusPill status="pending">Request sent</StatusPill>,
    capturing: <StatusPill status="confirmed">Accepted</StatusPill>,
    request: <StatusPill status="pending">Request</StatusPill>,
    due: <StatusPill status="unpaid">To pay</StatusPill>,
  }[stage];

  const heldUntil = stage === 'due' && lesson.holdExpiresAt !== null ? new Date(lesson.holdExpiresAt) : null;
  const answerBy = lesson.requestExpiresAt === null ? null : new Date(lesson.requestExpiresAt);

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="checkout-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle id="checkout-title">
            {formatDate(startsAt)} at {formatTime(startsAt)}
          </CardTitle>
          <CardDescription>
            {lesson.lessonType}, {formatMinutes(lesson.durationMinutes)} with {lesson.instructorName}
          </CardDescription>
        </div>
        {pill}
      </div>

      {stage === 'gone' ? null : <p className="text-h2 text-black tabular-nums">{price}</p>}

      {heldUntil === null ? null : (
        <p className="text-small text-grey-700">This slot is held for you until {formatTime(heldUntil)}.</p>
      )}

      {stage === 'gone' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarX className={iconClass} aria-hidden />}>
            {lesson.status === 'expired'
              ? 'This slot is no longer held for you, so the lesson is not booked.'
              : 'This lesson is not going ahead.'}{' '}
            {lesson.refunded ? 'Your payment is being refunded to your card.' : 'Nothing has been taken from your card.'}
          </Note>
          <LessonsButton />
        </div>
      ) : stage === 'paid' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarCheck className={iconClass} aria-hidden />}>
            That is paid for, and your lesson is confirmed.
          </Note>
          <LessonsButton />
        </div>
      ) : stage === 'authorised' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<Clock className={iconClass} aria-hidden />}>
            Your card is authorised for {price}. You are only charged if {lesson.instructorName} accepts, and the hold
            is released if they do not.
          </Note>
          <LessonsButton />
        </div>
      ) : stage === 'capturing' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarCheck className={iconClass} aria-hidden />}>
            {lesson.instructorName} accepted, so your card is being charged {price}.
          </Note>
          <LessonsButton />
        </div>
      ) : (
        <>
          {stage === 'request' ? (
            <Note icon={<Clock className={iconClass} aria-hidden />}>
              {lesson.instructorName} has
              {answerBy === null ? ' a little while' : ` until ${formatTime(answerBy)} on ${formatDate(answerBy)}`} to
              accept. Your card is only charged if they do.
            </Note>
          ) : null}
          <PayLesson
            bookingId={lesson.bookingId}
            pricePence={lesson.pricePence}
            businessName={lesson.businessName}
            savedCards={savedCards}
            request={stage === 'request'}
            live={serverEnv.PAYMENTS_PROVIDER === 'stripe'}
          />
        </>
      )}

      {stage === 'due' || stage === 'request' ? (
        <p className="text-small text-grey-700">
          {lesson.businessName} takes the payment. {lesson.instructorName} is told as soon as it goes through.
        </p>
      ) : null}
    </Card>
  );
}
