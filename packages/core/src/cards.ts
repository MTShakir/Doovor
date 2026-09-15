import { parseLocalDate, todayInZone } from './time/index.ts';

/**
 * Cards a learner has kept with a Business (PAY-02, M3-07).
 *
 * Only what the payments provider tells us is ever shown: the brand, the last four digits and
 * when the card runs out. The number itself never reaches us, and nothing here stores a card:
 * the provider keeps it, on the Business's own account (PAY-12).
 */
export interface CardSummary {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

const brandNames: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  cartes_bancaires: 'Cartes Bancaires',
  interac: 'Interac',
};

/** The brand as a person would say it. A brand we do not know is a card, not a code. */
export function cardBrandName(brand: string): string {
  return brandNames[brand.trim().toLowerCase()] ?? 'Card';
}

/** "Visa ending 4242", which is how a learner recognises their own card. */
export function describeCard(card: Pick<CardSummary, 'brand' | 'last4'>): string {
  return `${cardBrandName(card.brand)} ending ${card.last4}`;
}

/** "12/30", the way it is printed on the card. */
export function cardExpiry(card: Pick<CardSummary, 'expiryMonth' | 'expiryYear'>): string {
  return `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear % 100).padStart(2, '0')}`;
}

/**
 * Whether a card has run out. A card works until the end of the month printed on it, and the
 * month that matters is the one it is in the United Kingdom, which is where the lessons are.
 */
export function isCardExpired(card: Pick<CardSummary, 'expiryMonth' | 'expiryYear'>, now: Date): boolean {
  const { year, month } = parseLocalDate(todayInZone(now));
  if (card.expiryYear !== year) return card.expiryYear < year;
  return card.expiryMonth < month;
}

/** The cards that can still be charged, in the order the provider gave them: newest first. */
export function usableCards<Card extends CardSummary>(cards: readonly Card[], now: Date): Card[] {
  return cards.filter((card) => !isCardExpired(card, now));
}
