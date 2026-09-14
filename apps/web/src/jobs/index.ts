import { badgeExpirySweep } from './functions/badge-expiry';
import { bookingNotices } from './functions/booking-notices';
import { maintenanceSweep, recurrenceSweep, requestExpirySweep } from './functions/maintenance';
import { notificationDispatch } from './functions/notification-dispatch';
import { authorisationSweep, beforeLessonCharges, feeCharge, holdSweep, refundSend } from './functions/payments';
import { reminderSweep } from './functions/reminders';
import { outboxSweep } from './functions/outbox-sweep';
import { systemPingFunction } from './functions/ping';

/** Every job the runner serves. Add new ones here. */
export const functions = [
  systemPingFunction,
  outboxSweep,
  badgeExpirySweep,
  maintenanceSweep,
  requestExpirySweep,
  recurrenceSweep,
  bookingNotices,
  notificationDispatch,
  reminderSweep,
  holdSweep,
  refundSend,
  authorisationSweep,
  beforeLessonCharges,
  feeCharge,
];
