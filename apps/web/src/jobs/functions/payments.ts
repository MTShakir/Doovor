import { cron } from 'inngest';
import { inngest } from '../client';
import { paymentRefund } from '../events';
import { expirePaymentHolds, sendRefund } from '../payments';

/**
 * A slot held for somebody who never paid goes back in the diary (R-10). Often, because the
 * difference between a slot that is held and one that is free is what people book on.
 */
export const holdSweep = inngest.createFunction(
  {
    id: 'payment-hold-sweep',
    name: 'Give back slots whose hold ran out',
    triggers: [cron('TZ=Europe/London */5 * * * *')],
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
