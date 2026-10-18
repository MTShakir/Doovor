import { cron } from 'inngest';
import { settleAuthorisations } from '../authorisations';
import { chargeBeforeLessons } from '../charges';
import { inngest } from '../client';
import { bookingAccepted, bookingDeclined, paymentAuthorised, paymentFeeCharge, paymentReceived, paymentRefund } from '../events';
import { chargeFee } from '../fees';
import { sendReceipt } from '../receipts';
import { expirePaymentHolds, sendRefund } from '../payments';
import { schedules } from '../schedules';

/**
 * A slot held for somebody who never paid goes back in the diary (R-10). Every ten minutes: a
 * hold lasts fifteen, and a slot back within ten of that is still back for anybody looking (D-271).
 */
export const holdSweep = inngest.createFunction(
  {
    id: 'payment-hold-sweep',
    name: 'Give back slots whose hold ran out',
    triggers: [cron(schedules.holds)],
  },
  () => expirePaymentHolds(),
);

/**
 * Money the database has decided to give back is given back (PAY-07). A retry sends the same
 * refund, because it goes under a key of its own.
 */
export const refundSend = inngest.createFunction(
  { id: 'refund-send', name: 'Send a refund', triggers: [paymentRefund] },
  ({ event }) => sendRefund(event.data.refund_id),
);

/**
 * Every payment received gets its receipt, emailed to the learner (PAY-08). Money recorded in
 * person can be taken back out for ten minutes (D-089), so its receipt waits that long, and a
 * payment taken back out in the meantime gets none.
 */
export const receiptSend = inngest.createFunction(
  { id: 'receipt-send', name: 'Issue and email a receipt', triggers: [paymentReceived] },
  async ({ event, step }) => {
    const first = await step.run('issue-and-send', () => sendReceipt(event.data.payment_id));
    if (!('waitUntil' in first)) return first;
    await step.sleepUntil('wait-for-the-undo-window', first.waitUntil);
    return step.run('issue-and-send-after-waiting', () => sendReceipt(event.data.payment_id));
  },
);

/**
 * A fee nothing has paid is charged to the card the learner keeps (PAY-09). A retry charges once,
 * because the charge goes under a key of its own, and a fee paid meanwhile is left alone.
 */
export const feeCharge = inngest.createFunction(
  { id: 'fee-charge', name: 'Charge a late cancellation or no-show fee', triggers: [paymentFeeCharge] },
  ({ event }) => chargeFee(event.data.booking_id),
);

/**
 * An authorised card is taken when its request is accepted and let go when it is declined or
 * runs out (R-12). At once when an answer or an authorisation arrives, and every fifteen minutes
 * for the requests that simply ran out (D-271). One run at a time, so two answers arriving
 * together are settled in turn rather than raced.
 */
export const authorisationSweep = inngest.createFunction(
  {
    id: 'authorisation-sweep',
    name: 'Take or release authorised cards',
    concurrency: { limit: 1 },
    triggers: [cron(schedules.authorisations), bookingAccepted, bookingDeclined, paymentAuthorised],
  },
  () => settleAuthorisations(),
);

/**
 * Lessons paid for the day before are charged about a day before they start (PAY-03). Every half
 * hour is close enough to "24 hours before" for anybody (D-271), and one run at a time.
 */
export const beforeLessonCharges = inngest.createFunction(
  {
    id: 'before-lesson-charges',
    name: 'Charge lessons paid the day before',
    concurrency: { limit: 1 },
    triggers: [cron(schedules.charges)],
  },
  () => chargeBeforeLessons(),
);
