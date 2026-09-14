import { cron } from 'inngest';
import { inngest } from '../client';
import { creditLow, paymentReceived } from '../events';
import { notifyAboutPayment, notifyCreditLow, notifyOverdueLessons, sendDailyPaymentSummaries } from '../payment-notify';

/**
 * Everybody a payment concerns hears it arrived (NTF-03, PRD Appendix B, M3-22). Alongside its
 * receipt, and like it, money recorded in person waits the ten minutes it can be taken back out
 * in (D-089), so nobody is told about cash that was tapped by mistake.
 */
export const paymentReceivedNotices = inngest.createFunction(
  { id: 'payment-received-notices', name: 'Notify about a payment received', triggers: [paymentReceived] },
  async ({ event, step }) => {
    const first = await step.run('notify', () => notifyAboutPayment(event.data.payment_id));
    if (!('waitUntil' in first)) return first;
    await step.sleepUntil('wait-for-the-undo-window', first.waitUntil);
    return step.run('notify-after-waiting', () => notifyAboutPayment(event.data.payment_id));
  },
);

/**
 * Lessons and fees owed for two days are told about once, each morning (M3-22). One run at a
 * time, so a slow run and the next never tell anybody twice at once.
 */
export const overdueSweep = inngest.createFunction(
  {
    id: 'payment-overdue-sweep',
    name: 'Notify about lessons owed for two days',
    concurrency: { limit: 1 },
    triggers: [cron('TZ=Europe/London 0 10 * * *')],
  },
  () => notifyOverdueLessons(),
);

/** Using credit has left 2 hours or less: the learner and their instructor are told (M3-22). */
export const creditLowNotices = inngest.createFunction(
  { id: 'credit-low-notices', name: 'Notify about credit running low', triggers: [creditLow] },
  ({ event }) => notifyCreditLow(event.data.business_id, event.data.learner_id),
);

/** Each school's owners and managers get yesterday's payments in one message, each morning (M3-22). */
export const dailyPaymentSummaries = inngest.createFunction(
  {
    id: 'daily-payment-summaries',
    name: 'Sum up the day before for each school',
    triggers: [cron('TZ=Europe/London 0 8 * * *')],
  },
  () => sendDailyPaymentSummaries(),
);
