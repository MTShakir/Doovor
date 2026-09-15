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
import { SaveCard } from './save-card';

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
type Stage = 'fee' | 'gone' | 'paid' | 'authorised' | 'capturing' | 'request' | 'before' | 'due';

function stageOf(lesson: CheckoutLesson): Stage {
  // A lesson called off late, or nobody came to, whose fee nothing has paid: the fee is what to pay (PAY-09).
  if (lesson.feeOwed !== null) return 'fee';
  // A lesson that is not going ahead says so first, whatever became of what paid for it.
  if (['expired', 'cancelled', 'declined', 'no_show'].includes(lesson.status)) return 'gone';
  if (lesson.paid) return 'paid';
  if (lesson.authorised) return lesson.status === 'requested' ? 'authorised' : 'capturing';
  if (lesson.status === 'requested') return 'request';
  // Charged the day before, and not yet: nothing to pay now, only a card to have ready (PAY-03).
  if (lesson.paymentMode === 'before_lesson' && lesson.paymentStatus === 'unpaid') return 'before';
  return 'due';
}

/**
 * What became of the money, or the credit, for a lesson that is not going ahead (R-06 to R-08,
 * PAY-09): a late fee comes out of what was paid, and the rest goes back the way it came.
 */
function goneMoney(lesson: CheckoutLesson): string {
  const fee = lesson.status === 'no_show' ? 'no-show fee' : 'late cancellation fee';
  if (lesson.paidPence === 0) {
    if (lesson.paymentStatus === 'paid_credit' || lesson.paymentStatus === 'refunded' || lesson.paymentStatus === 'partially_refunded') {
      if (lesson.paymentStatus === 'refunded') return 'The credit it used has gone back to you.';
      if (lesson.paymentStatus === 'partially_refunded') {
        return `Part of the credit it used was kept as the ${fee}, and the rest has gone back to you.`;
      }
      return `The credit it used was kept as the ${fee}.`;
    }
    if (lesson.feePence > 0) return `A ${fee} of ${formatPence(lesson.feePence)} is owed.`;
    return 'Nothing has been taken from your card.';
  }

  const card = lesson.paidBy === 'card';
  const back = formatPence(lesson.refundPence);
  const goingBack = card
    ? lesson.refundPending
      ? 'is going back to your card'
      : 'has gone back to your card'
    : lesson.refundPending
      ? 'is owed back to you'
      : 'has been given back to you';

  if (lesson.refundPence >= lesson.paidPence) {
    return `The ${formatPence(lesson.paidPence)} you paid ${goingBack}.`;
  }
  if (lesson.refundPence > 0) {
    const kept = formatPence(lesson.paidPence - lesson.refundPence);
    return `${kept} of what you paid was kept as the ${fee}, and ${back} ${goingBack}.`;
  }
  if (lesson.feePence > 0) return `The ${formatPence(lesson.paidPence)} you paid was kept as the ${fee}.`;
  return `Nothing of the ${formatPence(lesson.paidPence)} you paid has been refunded yet. ${lesson.businessName} can tell you why.`;
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
  const price = formatPence(lesson.amountPence);
  const iconClass = 'size-5';

  // Cards kept with this Business, which only the provider holds (PAY-02, M3-07).
  const payable = (stage === 'due' || stage === 'request' || stage === 'before' || stage === 'fee') && lesson.accountId !== null;
  const kept = payable ? await keptCardsWith(lesson.businessId) : null;
  const savedCards = (kept?.cards ?? []).map((card) => ({
    paymentMethodId: card.paymentMethodId,
    label: describeCard(card),
    expiry: cardExpiry(card),
  }));

  const pill = {
    fee: <StatusPill status="unpaid">Fee to pay</StatusPill>,
    gone: lesson.status === 'expired' ? <StatusPill status="pending">Slot gone</StatusPill> : <StatusPill status="cancelled" />,
    paid: <StatusPill status="paid">Paid</StatusPill>,
    authorised: <StatusPill status="pending">Request sent</StatusPill>,
    capturing: <StatusPill status="confirmed">Accepted</StatusPill>,
    request: <StatusPill status="pending">Request</StatusPill>,
    before: <StatusPill status="confirmed">Booked</StatusPill>,
    due: <StatusPill status="unpaid">To pay</StatusPill>,
  }[stage];

  // The charge is made a day before the lesson (PAY-03, M3-09).
  const now = new Date();
  const chargeAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  const chargeSoon = chargeAt.getTime() <= now.getTime();
  const card = savedCards[0];

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

      {stage === 'fee' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarX className={iconClass} aria-hidden />}>
            {lesson.feeOwed === 'no_show'
              ? 'This lesson was marked as a no-show, which costs what cancelling late does.'
              : 'This lesson was cancelled late.'}{' '}
            {lesson.paymentStatus === 'failed'
              ? `Your saved card could not be charged the ${price} fee, so pay it here.`
              : `The ${price} fee is still to pay.`}
          </Note>
          {lesson.accountId === null ? (
            <p className="text-small text-grey-700">Pay {lesson.businessName} in person.</p>
          ) : (
            <PayLesson
              bookingId={lesson.bookingId}
              pricePence={lesson.amountPence}
              businessName={lesson.businessName}
              savedCards={savedCards}
              request={false}
              live={serverEnv.PAYMENTS_PROVIDER === 'stripe'}
              fee
            />
          )}
        </div>
      ) : stage === 'gone' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarX className={iconClass} aria-hidden />}>
            {lesson.status === 'expired'
              ? 'This slot is no longer held for you, so the lesson is not booked.'
              : lesson.status === 'no_show'
                ? 'This lesson was marked as a no-show.'
                : 'This lesson is not going ahead.'}{' '}
            {goneMoney(lesson)}
          </Note>
          <LessonsButton />
        </div>
      ) : stage === 'paid' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<CalendarCheck className={iconClass} aria-hidden />}>
            {lesson.status === 'completed' ? 'That is paid for. Thank you.' : 'That is paid for, and your lesson is confirmed.'}
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
      ) : stage === 'before' ? (
        <div className="flex flex-col gap-3">
          <Note icon={<Clock className={iconClass} aria-hidden />}>
            {card
              ? `${price} is charged to your ${card.label} ${chargeSoon ? 'shortly' : `at ${formatTime(chargeAt)} on ${formatDate(chargeAt)}`}, a day before the lesson.`
              : `Save a card and ${price} is charged to it ${chargeSoon ? 'shortly' : `at ${formatTime(chargeAt)} on ${formatDate(chargeAt)}`}, a day before the lesson. Nothing is taken until then.`}{' '}
            {lesson.businessName} can also charge it a late cancellation or no-show fee under its cancellation policy.
          </Note>
          {card ? <LessonsButton /> : null}
          <SaveCard bookingId={lesson.bookingId} replacing={card !== undefined} live={serverEnv.PAYMENTS_PROVIDER === 'stripe'} />
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
          {lesson.paymentStatus === 'failed' ? (
            <Note icon={<CalendarX className={iconClass} aria-hidden />}>
              {lesson.paymentMode === 'before_lesson'
                ? 'This lesson could not be charged the day before. Pay now to keep it.'
                : 'Your last payment for this lesson did not go through. Try again.'}
            </Note>
          ) : null}
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

      {stage === 'due' || stage === 'request' || (stage === 'fee' && lesson.accountId !== null) ? (
        <p className="text-small text-grey-700">
          {lesson.businessName} takes the payment. {lesson.instructorName} is told as soon as it goes through.
        </p>
      ) : null}
    </Card>
  );
}
