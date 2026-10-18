import { badgeExpirySweep } from './functions/badge-expiry';
import { learnerCaptureConfirmations } from './functions/capture';
import { regionOpenedNotices } from './functions/regions';
import { bookingNotices } from './functions/booking-notices';
import { feedbackHandledEmails, feedbackReceivedEmails } from './functions/feedback';
import { badgeExpiringNotices, verificationDecidedNotices } from './functions/instructor-notices';
import { deletionSweep, maintenanceSweep, recurrenceSweep, requestExpirySweep } from './functions/maintenance';
import { creditLowNotices, dailyPaymentSummaries, overdueSweep, paymentReceivedNotices } from './functions/payment-notices';
import { authorisationSweep, beforeLessonCharges, feeCharge, holdSweep, receiptSend, refundSend } from './functions/payments';
import { lessonRecordNotices } from './functions/record-notices';
import { reminderByHand, reminderSweep } from './functions/reminders';
import { outboxSweep } from './functions/outbox-sweep';
import { subscriptionRenewalNotices } from './functions/subscriptions';
import { systemPingFunction } from './functions/ping';
import { welcomeNotices } from './functions/welcome-notices';

/** Every job the runner serves. Add new ones here. */
export const functions = [
  systemPingFunction,
  outboxSweep,
  badgeExpirySweep,
  deletionSweep,
  maintenanceSweep,
  requestExpirySweep,
  recurrenceSweep,
  bookingNotices,
  reminderSweep,
  reminderByHand,
  holdSweep,
  refundSend,
  authorisationSweep,
  beforeLessonCharges,
  feeCharge,
  receiptSend,
  paymentReceivedNotices,
  overdueSweep,
  creditLowNotices,
  dailyPaymentSummaries,
  lessonRecordNotices,
  learnerCaptureConfirmations,
  regionOpenedNotices,
  subscriptionRenewalNotices,
  feedbackReceivedEmails,
  feedbackHandledEmails,
  welcomeNotices,
  verificationDecidedNotices,
  badgeExpiringNotices,
];
