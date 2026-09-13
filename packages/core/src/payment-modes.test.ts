import { describe, expect, it } from 'vitest';
import { asksForCard, chosenPaymentMode, isPaymentMode, paymentModeCopy, paymentModes } from './payment-modes.ts';

describe('how a Business takes its money (PAY-03, M3-09)', () => {
  it('knows the four choices and nothing else', () => {
    expect(paymentModes).toEqual(['at_booking', 'before_lesson', 'after_lesson', 'offline']);
    expect(isPaymentMode('before_lesson')).toBe(true);
    expect(isPaymentMode('credit')).toBe(false);
    expect(isPaymentMode('whenever')).toBe(false);
    expect(isPaymentMode(3)).toBe(false);
  });

  it('pays at booking unless the Business chose something it can choose', () => {
    expect(chosenPaymentMode({ payment_mode: 'before_lesson' })).toBe('before_lesson');
    expect(chosenPaymentMode({ payment_mode: 'offline', other: true })).toBe('offline');
    expect(chosenPaymentMode({ payment_mode: 'credit' })).toBe('at_booking');
    expect(chosenPaymentMode({})).toBe('at_booking');
    expect(chosenPaymentMode(null)).toBe('at_booking');
    expect(chosenPaymentMode('before_lesson')).toBe('at_booking');
  });

  it('asks for a card only where one can be taken and was wanted', () => {
    expect(asksForCard({ chargesEnabled: true, mode: 'at_booking' })).toBe(true);
    expect(asksForCard({ chargesEnabled: true, mode: 'before_lesson' })).toBe(true);
    expect(asksForCard({ chargesEnabled: true, mode: 'offline' })).toBe(false);
    expect(asksForCard({ chargesEnabled: false, mode: 'at_booking' })).toBe(false);
  });

  it('explains every choice in plain words, without dashes', () => {
    for (const mode of paymentModes) {
      const copy = paymentModeCopy[mode];
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.description).toMatch(/\.$/);
      expect(`${copy.label}${copy.description}`).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
