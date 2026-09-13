import { cardExpiry, describeCard } from '@repo/core/cards';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { CalendarCheck, CalendarX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { serverEnv } from '@/env/server';
import { requirePortal } from '@/lib/auth/session';
import { keptCardsWith } from '@/lib/payments/cards';
import { checkoutLesson } from '@/lib/payments/checkout';
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

/** PAY-02, PAY-03: what is being paid for, and the one button that does it. */
async function Checkout({ params }: { params: Promise<{ booking: string }> }) {
  // Somebody's own lesson and the state of their payment, which no shell can know.
  await connection();
  await requirePortal('learner');
  const { booking } = await params;
  const lesson = await checkoutLesson(booking);
  if (!lesson) notFound();

  const startsAt = new Date(lesson.startsAt);
  // A slot held while somebody pays goes back to the diary when the hold runs out (R-10).
  const gone = !lesson.paid && ['expired', 'cancelled', 'declined'].includes(lesson.status);
  const heldUntil = gone || lesson.paid || lesson.holdExpiresAt === null ? null : new Date(lesson.holdExpiresAt);
  // Cards kept with this Business, which only the provider holds (PAY-02, M3-07).
  const payable = !gone && !lesson.paid && lesson.accountId !== null;
  const kept = payable ? await keptCardsWith(lesson.businessId) : null;
  const savedCards = (kept?.cards ?? []).map((card) => ({
    paymentMethodId: card.paymentMethodId,
    label: describeCard(card),
    expiry: cardExpiry(card),
  }));

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
        {gone ? (
          <StatusPill status="pending">Slot gone</StatusPill>
        ) : (
          <StatusPill status={lesson.paid ? 'paid' : 'unpaid'}>{lesson.paid ? 'Paid' : 'To pay'}</StatusPill>
        )}
      </div>

      {gone ? null : <p className="text-h2 text-black tabular-nums">{formatPence(lesson.pricePence)}</p>}

      {heldUntil === null ? null : (
        <p className="text-small text-grey-700">This slot is held for you until {formatTime(heldUntil)}.</p>
      )}

      {gone ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body text-ink">
            <CalendarX className="size-5 shrink-0 text-grey-700" aria-hidden />
            The slot was held while you paid, and the hold has run out. Nothing has been charged.
          </p>
          <Button asChild width="responsive">
            <Link href="/app/learner/lessons">See your lessons</Link>
          </Button>
        </div>
      ) : lesson.paid ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body text-ink">
            <CalendarCheck className="size-5 shrink-0 text-grey-700" aria-hidden />
            That is paid for, and your lesson is confirmed.
          </p>
          <Button asChild width="responsive">
            <Link href="/app/learner/lessons">See your lessons</Link>
          </Button>
        </div>
      ) : (
        <PayLesson
          bookingId={lesson.bookingId}
          pricePence={lesson.pricePence}
          businessName={lesson.businessName}
          savedCards={savedCards}
          live={serverEnv.PAYMENTS_PROVIDER === 'stripe'}
        />
      )}

      {gone ? null : (
        <p className="text-small text-grey-700">
          {lesson.businessName} takes the payment. {lesson.instructorName} is told as soon as it goes through.
        </p>
      )}
    </Card>
  );
}
