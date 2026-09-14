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
export const bookingCompleted = bookingEvent('booking.completed');
export const bookingNoShow = bookingEvent('booking.no_show');
export const bookingDisputed = bookingEvent('booking.disputed');
export const bookingDisputeDecided = bookingEvent('booking.dispute_decided');

/**
 * Money that has to go back (PAY-07, R-10). The refund is already decided and written down;
 * the event only says which one, so the job can send it.
 */
export const paymentRefund = eventType('payment.refund', {
  schema: staticSchema<{ refund_id: string; payment_id: string; booking_id: string | null }>(),
});

/**
 * A lesson paid for the day before could not be charged (PAY-03). The reason is a word, not a
 * message from the bank, and nothing about the card.
 */
export const paymentChargeFailed = eventType('payment.charge_failed', {
  schema: staticSchema<{ booking_id: string; reason: string }>(),
});

/**
 * A fee for a lesson called off late, or nobody came to, that nothing has paid: to be charged to
 * the card the learner keeps with the Business (PAY-09). The amount is the database's to say.
 */
export const paymentFeeCharge = eventType('payment.fee_charge', {
  schema: staticSchema<{ booking_id: string }>(),
});

/** A card set aside for a request, waiting to be taken or let go (R-12). */
export const paymentAuthorised = eventType('payment.authorised', {
  schema: staticSchema<{ payment_id: string; booking_id: string }>(),
});
