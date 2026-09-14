import { describe, expect, it } from 'vitest';
import { addressLines, receiptLine, receiptTitle, receiptWords, type Receipt } from './receipts.ts';

// 10:00 in London, in British Summer Time.
const lessonAt = new Date('2026-09-15T09:00:00Z');

const receipt = (overrides: Partial<Receipt> = {}): Receipt => ({
  number: 42,
  issuedAt: new Date('2026-09-14T11:30:00Z'),
  businessName: 'Quayside Driving School',
  businessAddress: { line1: '4 Quay Street', line2: '', town: 'Manchester', postcode: 'M1 2QF' },
  vatNumber: null,
  vatRatePercent: null,
  vatPence: null,
  amountPence: 6200,
  method: 'card',
  kind: 'lesson',
  lessonStartsAt: lessonAt,
  lessonMinutes: 90,
  lessonType: 'Standard lesson',
  instructorName: 'Emma Clarke',
  creditMinutes: null,
  ...overrides,
});

describe('what a receipt says (PAY-08, M3-20)', () => {
  it('is numbered, and dated with the year', () => {
    expect(receiptTitle(receipt())).toBe('Receipt 42');
    expect(receiptWords(receipt()).issuedOn).toBe('Mon 14 Sep 2026');
  });

  it('gives the address in its lines, leaving out what is missing', () => {
    expect(addressLines(receipt().businessAddress)).toEqual(['4 Quay Street', 'Manchester', 'M1 2QF']);
    expect(addressLines({ postcode: ' LS6 3QS ' })).toEqual(['LS6 3QS']);
    expect(addressLines(null)).toEqual([]);
  });

  it('says what was paid for', () => {
    expect(receiptLine(receipt())).toBe('Standard lesson, 1 hour 30 minutes on Tue 15 Sep at 10:00 with Emma Clarke');
    expect(receiptLine(receipt({ kind: 'late_cancellation_fee' }))).toBe('Late cancellation fee for the lesson on Tue 15 Sep at 10:00');
    expect(receiptLine(receipt({ kind: 'no_show_fee' }))).toBe('No-show fee for the lesson on Tue 15 Sep at 10:00');
    expect(receiptLine(receipt({ kind: 'credit', creditMinutes: 600, lessonStartsAt: null }))).toBe('10 hours of lesson credit');
    expect(receiptLine(receipt({ kind: 'other' }))).toBe('Payment');
    expect(receiptLine(receipt({ lessonType: null, lessonMinutes: null, lessonStartsAt: null, instructorName: null }))).toBe('Lesson');
  });

  it('shows VAT only for a Business registered for it, and then with its number (PAY-08)', () => {
    expect(receiptWords(receipt()).vat).toBeNull();
    expect(receiptWords(receipt({ vatNumber: 'GB123456789', vatRatePercent: 20, vatPence: 1033 })).vat).toEqual({
      label: 'VAT at 20% included',
      amount: '£10.33',
      number: 'VAT number GB123456789',
    });
  });

  it('says how it was paid, and the total', () => {
    const words = receiptWords(receipt({ method: 'bank', amountPence: 4250 }));
    expect(words.paidBy).toBe('Paid by bank transfer');
    expect(words.total).toBe('£42.50');
    expect(receiptWords(receipt({ method: 'cash' })).paidBy).toBe('Paid in cash');
  });
});
