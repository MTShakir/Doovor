import { eventType, staticSchema } from 'inngest';

/**
 * Every event the app sends. They carry identifiers only, never personal data, because they
 * leave the United Kingdom (ARCHITECTURE 9). Each milestone adds the events it needs.
 */
export const systemPing = eventType('system/ping', { schema: staticSchema<{ at: string }>() });

/** A badge is running out (INS-03). The summary is copy, not personal data. */
export const badgeExpiring = eventType('instructor/badge-expiring', {
  schema: staticSchema<{
    instructor_profile_id: string;
    business_id: string;
    days_before: number;
    summary: string;
  }>(),
});

/**
 * What happened to a lesson (BOK-01 to BOK-09). The names match the rows the RPCs write to
 * the outbox, because the dispatcher sends them through unchanged (D-017).
 */
const bookingEvent = <Name extends string>(name: Name) =>
  eventType(name, { schema: staticSchema<{ booking_id: string; [key: string]: unknown }>() });

export const bookingCreated = bookingEvent('booking.created');
export const bookingAccepted = bookingEvent('booking.accepted');
export const bookingDeclined = bookingEvent('booking.declined');
export const bookingCancelled = bookingEvent('booking.cancelled');
export const bookingRescheduled = bookingEvent('booking.rescheduled');

/**
 * Money that has to go back (PAY-07, R-10). The refund is already decided and written down;
 * the event only says which one, so the job can send it.
 */
export const paymentRefund = eventType('payment.refund', {
  schema: staticSchema<{ refund_id: string; payment_id: string; booking_id: string | null }>(),
});
