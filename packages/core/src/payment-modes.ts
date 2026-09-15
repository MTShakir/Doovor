/**
 * How a Business takes its money (PAY-03, M3-09).
 *
 * The same four words as the database's `booking_payment_mode`, less `credit`, which is not a
 * choice: credit is always used first whatever the Business chose (PAY-04).
 */
export const paymentModes = ['at_booking', 'before_lesson', 'after_lesson', 'offline'] as const;

export type PaymentMode = (typeof paymentModes)[number];

export function isPaymentMode(value: unknown): value is PaymentMode {
  return typeof value === 'string' && (paymentModes as readonly string[]).includes(value);
}

/** What each choice means, in the words an instructor would use to explain it to a learner. */
export const paymentModeCopy: Record<PaymentMode, { label: string; description: string }> = {
  at_booking: {
    label: 'When they book',
    description: 'The slot is held while they pay, and the lesson is confirmed once they have.',
  },
  before_lesson: {
    label: 'The day before the lesson',
    description: 'They save a card when they book, and it is charged 24 hours before the lesson.',
  },
  after_lesson: {
    label: 'After the lesson',
    description: 'They get a link to pay as soon as you finish the lesson.',
  },
  offline: {
    label: 'In person',
    description: 'Cash or bank transfer, paid to you directly. Learners are not asked for a card.',
  },
};

/** The mode a Business has chosen, from its settings. Pay at booking unless it chose otherwise. */
export function chosenPaymentMode(settings: unknown): PaymentMode {
  if (settings !== null && typeof settings === 'object' && 'payment_mode' in settings) {
    const chosen = settings.payment_mode;
    if (isPaymentMode(chosen)) return chosen;
  }
  return 'at_booking';
}

/**
 * Whether a learner is offered a card for a lesson at a Business. A Business that cannot take
 * cards, or chose to be paid in person, never asks for one.
 */
export function asksForCard(input: { chargesEnabled: boolean; mode: PaymentMode }): boolean {
  return input.chargesEnabled && input.mode !== 'offline';
}
