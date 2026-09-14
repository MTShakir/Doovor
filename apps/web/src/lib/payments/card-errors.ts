/**
 * What to tell somebody when a card they typed in could not be used (PAY-02, M3-23).
 *
 * The provider's own messages are written for any shop and change without notice, so the words
 * are ours, chosen by the error's code. Anything not listed gets a message that still says what
 * to do next.
 */

/** The parts of a Stripe.js error the words depend on. */
export interface CardError {
  type?: string;
  code?: string;
  decline_code?: string;
  /** Set when the error is about a payment that has already moved on. */
  payment_intent?: { status?: string } | null;
  setup_intent?: { status?: string } | null;
}

const refused = 'The card was refused. Try another one.';

const messages: Record<string, string> = {
  card_declined: refused,
  expired_card: 'The card has run out. Try another one.',
  incorrect_cvc: 'The security code is wrong. Check it and try again.',
  invalid_cvc: 'The security code is wrong. Check it and try again.',
  incorrect_number: 'The card number is wrong. Check it and try again.',
  invalid_number: 'The card number is wrong. Check it and try again.',
  invalid_expiry_month: 'The expiry date is wrong. Check it and try again.',
  invalid_expiry_year: 'The expiry date is wrong. Check it and try again.',
  incorrect_zip: 'The postcode does not match the card. Check it and try again.',
  processing_error: 'The card could not be used just now. Try again in a moment.',
  payment_intent_authentication_failure: 'Your bank could not check it was you. Try again, or use another card.',
  setup_intent_authentication_failure: 'Your bank could not check it was you. Try again, or use another card.',
};

export function cardErrorMessage(error: CardError): string {
  if (error.code !== undefined && error.code in messages) return messages[error.code] ?? refused;
  // A field left empty or half typed: the form marks which one.
  if (error.type === 'validation_error') return 'Check the card details and try again.';
  if (error.type === 'card_error') return refused;
  return 'The card could not be used. Try again, or use another card.';
}

/**
 * A second press on a payment that already went through, or is going through, is not a failure:
 * the money is taken or held, and the webhook will say so.
 */
export function alreadyConfirmed(error: CardError): boolean {
  const status = error.payment_intent?.status ?? error.setup_intent?.status;
  return status === 'succeeded' || status === 'processing' || status === 'requires_capture';
}
