import { describe, expect, it } from 'vitest';
import { alreadyConfirmed, cardErrorMessage } from './card-errors';

describe('a card that could not be used (PAY-02, M3-23)', () => {
  it('says what went wrong in our words, and what to do about it', () => {
    expect(cardErrorMessage({ type: 'card_error', code: 'card_declined', decline_code: 'insufficient_funds' })).toBe(
      'The card was refused. Try another one.',
    );
    expect(cardErrorMessage({ type: 'card_error', code: 'expired_card' })).toBe('The card has run out. Try another one.');
    expect(cardErrorMessage({ type: 'card_error', code: 'incorrect_cvc' })).toBe('The security code is wrong. Check it and try again.');
    expect(cardErrorMessage({ type: 'invalid_request_error', code: 'payment_intent_authentication_failure' })).toBe(
      'Your bank could not check it was you. Try again, or use another card.',
    );
  });

  it('falls back on something that still says what to do', () => {
    expect(cardErrorMessage({ type: 'validation_error', code: 'incomplete_number' })).toBe('Check the card details and try again.');
    expect(cardErrorMessage({ type: 'card_error', code: 'something_new' })).toBe('The card was refused. Try another one.');
    expect(cardErrorMessage({ type: 'api_connection_error' })).toBe('The card could not be used. Try again, or use another card.');
  });

  it('never uses a dash', () => {
    const all = [
      'card_declined',
      'expired_card',
      'incorrect_cvc',
      'incorrect_number',
      'invalid_expiry_year',
      'incorrect_zip',
      'processing_error',
      'setup_intent_authentication_failure',
    ].map((code) => cardErrorMessage({ code }));
    for (const message of all) expect(message).not.toMatch(/[\u2013\u2014]/);
  });

  it('treats a payment that already went through, or is held, as done rather than failed', () => {
    expect(alreadyConfirmed({ code: 'payment_intent_unexpected_state', payment_intent: { status: 'succeeded' } })).toBe(true);
    expect(alreadyConfirmed({ code: 'payment_intent_unexpected_state', payment_intent: { status: 'requires_capture' } })).toBe(true);
    expect(alreadyConfirmed({ code: 'setup_intent_unexpected_state', setup_intent: { status: 'succeeded' } })).toBe(true);
    expect(alreadyConfirmed({ code: 'card_declined', payment_intent: { status: 'requires_payment_method' } })).toBe(false);
    expect(alreadyConfirmed({ code: 'card_declined' })).toBe(false);
  });
});
