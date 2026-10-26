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
/** A payment hold ran out and the database gave the slot back (R-10, D-274). */
export const bookingHoldExpired = bookingEvent('booking.hold_expired');
export const bookingCancelled = bookingEvent('booking.cancelled');
export const bookingRescheduled = bookingEvent('booking.rescheduled');
/** The school's office gave a lesson to another of its instructors (D-397). */
export const bookingReassigned = bookingEvent('booking.reassigned');
export const bookingCompleted = bookingEvent('booking.completed');
/** An instructor asked for a reminder from the lesson's sheet (NTF-02, D-166). */
export const bookingReminderRequested = bookingEvent('booking.reminder_requested');
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

/** Money a learner paid a Business has arrived, which is what a receipt is for (PAY-08). */
export const paymentReceived = eventType('payment.received', {
  schema: staticSchema<{ payment_id: string; booking_id?: string | null }>(),
});

/**
 * Using credit has left a learner 2 hours or less with a Business (NTF-03, M3-22). Who to tell,
 * and what is left by the time they are told, is the database's to say.
 */
export const creditLow = eventType('credit.low', {
  schema: staticSchema<{ business_id: string; learner_id: string; balance_minutes: number }>(),
});

/** A card set aside for a request, waiting to be taken or let go (R-12). */
export const paymentAuthorised = eventType('payment.authorised', {
  schema: staticSchema<{ payment_id: string; booking_id: string }>(),
});

/**
 * A lesson record was saved (PRG-01, NTF-03, M4-12). Whether the learner reads it, and what it
 * says, is the database's to say; the event carries the ids only.
 */
/**
 * Staff decided an instructor's badge (INS-02). The database queues it with the decision; the job
 * reads the rest, so the event carries ids and the outcome's word only (D-260).
 */
export const instructorVerificationDecided = eventType('instructor/verification-decided', {
  schema: staticSchema<{ instructor_profile_id: string; business_id: string; status: string }>(),
});

/**
 * Somebody's email was confirmed for the first time, or they signed up with Google or Apple, which
 * confirm it themselves (D-259). The database queues it; the job welcomes them.
 */
export const accountEmailConfirmed = eventType('account/email-confirmed', {
  schema: staticSchema<{ user_id: string }>(),
});

/**
 * A learner accepted an invitation (LRN-03, D-301). The database queues it as it links them; the job
 * tells the instructor who sent it, and their school. Which invitation, and nothing about who.
 */
export const learnerJoined = eventType('learner.joined', {
  schema: staticSchema<{ invitation_id: string }>(),
});

export const lessonRecordAdded = eventType('lesson_record.added', {
  schema: staticSchema<{ lesson_record_id: string; booking_id: string }>(),
});

/**
 * Somebody joined an area's waiting list or posted a lesson request (MKT-10, M5-10), to be confirmed
 * by email. Which one, and nothing about who.
 */
export const learnerCaptureCreated = eventType('learner_capture.created', {
  schema: staticSchema<{ kind: 'waiting_list' | 'lesson_request'; id: string }>(),
});

/**
 * Somebody told us something (D-202, D-241), and is owed an email saying it arrived and what its
 * reference is. The id and nothing else: an event carries identifiers, never what was written.
 */
export const feedbackSubmitted = eventType('feedback.submitted', {
  schema: staticSchema<{ feedback_id: string }>(),
});

/** A person dealt with a report (D-241), so whoever sent it is told it is closed. */
export const feedbackHandled = eventType('feedback.handled', {
  schema: staticSchema<{ feedback_id: string }>(),
});

/** A super admin opened the learner marketplace in a postcode area (ADM-04, M5-19): the people waiting there are told. */
export const marketplaceRegionOpened = eventType('marketplace_region.opened', {
  schema: staticSchema<{ area: string }>(),
});

/**
 * Something changed in a school's arrangements (M9-28, D-295): a pupil offered or taken, a linked
 * instructor's fees, a learner asked whether to move, a link or a membership ended. The database
 * queues it with the change; the kind of notice and the row's id are all it carries.
 */
export const schoolNotice = eventType('school.notice', {
  schema: staticSchema<{ kind: string; id: string }>(),
});
