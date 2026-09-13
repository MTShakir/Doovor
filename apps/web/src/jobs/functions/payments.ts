import { cron } from 'inngest';
import { settleAuthorisations } from '../authorisations';
import { inngest } from '../client';
import { bookingAccepted, bookingDeclined, paymentAuthorised, paymentRefund } from '../events';
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

/**
 * An authorised card is taken when its request is accepted and let go when it is declined or
 * runs out (R-12). At once when an answer or an authorisation arrives, and every five minutes
 * for the requests that simply ran out. One run at a time, so two answers arriving together
 * are settled in turn rather than raced.
 */
export const authorisationSweep = inngest.createFunction(
  {
    id: 'authorisation-sweep',
    name: 'Take or release authorised cards',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/London */5 * * * *'), bookingAccepted, bookingDeclined, paymentAuthorised],
  },
  () => settleAuthorisations(),
);
