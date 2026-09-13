import { describe, expect, it } from 'vitest';
import { cardBrandName, cardExpiry, describeCard, isCardExpired, usableCards } from './cards.ts';

const visa = { brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 };

describe('how a card is described (PAY-02, M3-07)', () => {
  it('names the brand the way a person would', () => {
    expect(cardBrandName('visa')).toBe('Visa');
    expect(cardBrandName('mastercard')).toBe('Mastercard');
    expect(cardBrandName('amex')).toBe('American Express');
    expect(cardBrandName(' AMEX ')).toBe('American Express');
  });

  it('calls a brand it does not know a card, rather than showing a code', () => {
    expect(cardBrandName('link')).toBe('Card');
    expect(cardBrandName('')).toBe('Card');
  });

  it('says which card it is by its last four digits', () => {
    expect(describeCard(visa)).toBe('Visa ending 4242');
    expect(describeCard({ brand: 'something_new', last4: '0005' })).toBe('Card ending 0005');
  });

  it('prints the expiry as it is printed on the card', () => {
    expect(cardExpiry(visa)).toBe('12/30');
    expect(cardExpiry({ expiryMonth: 4, expiryYear: 2031 })).toBe('04/31');
    expect(cardExpiry({ expiryMonth: 1, expiryYear: 2100 })).toBe('01/00');
  });
});

describe('when a card runs out', () => {
  const card = { expiryMonth: 9, expiryYear: 2026 };

  it('works to the last day of the month printed on it', () => {
    expect(isCardExpired(card, new Date('2026-09-30T22:59:00Z'))).toBe(false);
  });

  it('stops at midnight in the United Kingdom, not in UTC', () => {
    // 23:30 on 30 September in UTC is already half past midnight on 1 October in London.
    expect(isCardExpired(card, new Date('2026-09-30T23:30:00Z'))).toBe(true);
  });

  it('is fine in any earlier month or year, and gone in any later one', () => {
    expect(isCardExpired(card, new Date('2026-08-15T12:00:00Z'))).toBe(false);
    expect(isCardExpired(card, new Date('2025-12-15T12:00:00Z'))).toBe(false);
    expect(isCardExpired(card, new Date('2027-01-15T12:00:00Z'))).toBe(true);
    expect(isCardExpired({ expiryMonth: 12, expiryYear: 2025 }, new Date('2026-01-01T12:00:00Z'))).toBe(true);
  });

  it('offers only the cards that still work, newest first as they came', () => {
    const cards = [
      { ...visa, last4: '1111', expiryYear: 2025 },
      { ...visa, last4: '2222' },
      { ...visa, last4: '3333', expiryMonth: 1, expiryYear: 2031 },
    ];
    expect(usableCards(cards, new Date('2026-09-13T12:00:00Z')).map((one) => one.last4)).toEqual(['2222', '3333']);
  });
});
