import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { serverEnv } from '@/env/server';
import { chargeFee } from '@/jobs/fees';
import { notifyAboutBooking } from '@/jobs/notify';
import { notifyAboutPayment, notifyCreditLow } from '@/jobs/payment-notify';
import { isCaptureKind, sendCaptureConfirmation } from '@/jobs/capture';
import { tellRegionOpened } from '@/jobs/regions';
import { sendRefund } from '@/jobs/payments';
import { sendReceipt } from '@/jobs/receipts';
import { notifyLessonRecordAdded } from '@/jobs/record-notices';

const eventSchema = z.object({
  name: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Runs the job one outbox event would start, in this process, while the fake provider is in use
 * (M3-18).
 *
 * The job runner is not part of a local end to end run, and the fake keeps its payments in this
 * process, so this is how a test walks from a lesson being cancelled to the refund reaching the
 * card and the learner being told. The test reads the event the database wrote and hands it
 * here; this does only what the job for that event does. Not reachable in production, and never
 * with Stripe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (serverEnv.APP_ENV === 'production' || serverEnv.PAYMENTS_PROVIDER === 'stripe') {
    return new NextResponse('Not found', { status: 404 });
  }

  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'An event is a name and a payload.' }, { status: 400 });
  const { name, payload } = parsed.data;

  if (name === 'payment.refund') {
    const refundId = typeof payload.refund_id === 'string' ? payload.refund_id : '';
    return NextResponse.json(await sendRefund(refundId));
  }
  // Two jobs start from a payment received: its receipt, and telling people about it (M3-22).
  if (name === 'payment.received') {
    const paymentId = typeof payload.payment_id === 'string' ? payload.payment_id : '';
    return NextResponse.json({ receipt: await sendReceipt(paymentId), notices: await notifyAboutPayment(paymentId) });
  }
  if (name === 'credit.low') {
    const businessId = typeof payload.business_id === 'string' ? payload.business_id : '';
    const learnerId = typeof payload.learner_id === 'string' ? payload.learner_id : '';
    return NextResponse.json(await notifyCreditLow(businessId, learnerId));
  }
  if (name === 'lesson_record.added') {
    const lessonRecordId = typeof payload.lesson_record_id === 'string' ? payload.lesson_record_id : '';
    return NextResponse.json(await notifyLessonRecordAdded(lessonRecordId));
  }
  if (name === 'learner_capture.created') {
    const id = typeof payload.id === 'string' ? payload.id : '';
    if (!isCaptureKind(payload.kind)) return NextResponse.json({ error: 'A capture is a waiting list place or a lesson request.' }, { status: 400 });
    return NextResponse.json(await sendCaptureConfirmation(payload.kind, id));
  }
  if (name === 'marketplace_region.opened') {
    const area = typeof payload.area === 'string' ? payload.area : '';
    return NextResponse.json(await tellRegionOpened(area));
  }
  if (name === 'payment.fee_charge') {
    const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : '';
    return NextResponse.json(await chargeFee(bookingId));
  }
  if (name.startsWith('booking.') || name === 'payment.charge_failed') {
    return NextResponse.json(await notifyAboutBooking({ name, payload }));
  }
  return NextResponse.json({ error: `Nothing here runs for ${name}.` }, { status: 400 });
}
