import { receiptWords, type Receipt } from '@repo/core/receipts';
import { describe, expect, it } from 'vitest';
import { renderReceiptEmail } from './render.ts';

/** Em dash and en dash: never in anything a person reads (CLAUDE.md rule 9). */
const DASHES = /[\u2013\u2014]/;

const receipt: Receipt = {
  number: 42,
  issuedAt: new Date('2026-09-14T11:30:00Z'),
  businessName: 'Quayside Driving School',
  businessAddress: { line1: '4 Quay Street', town: 'Manchester', postcode: 'M1 2QF' },
  vatNumber: null,
  vatRatePercent: null,
  vatPence: null,
  amountPence: 6200,
  method: 'card',
  kind: 'lesson',
  lessonStartsAt: new Date('2026-09-15T09:00:00Z'),
  lessonMinutes: 90,
  lessonType: 'Standard lesson',
  instructorName: 'Emma Clarke',
  creditMinutes: null,
};

const render = (overrides: Partial<Receipt> = {}) =>
  renderReceiptEmail({
    receipt: receiptWords({ ...receipt, ...overrides }),
    greeting: 'Hello Polly',
    url: 'https://example.com/app/receipts/payment-1',
  });

describe('the receipt email (PAY-08, M3-20)', () => {
  it('for a Business not registered for VAT: who was paid, what for, how much, and no VAT at all', async () => {
    const email = await render();

    expect(email.subject).toBe('Receipt 42 from Quayside Driving School');
    expect(email.html).toContain('4 Quay Street');
    expect(email.html).toContain('Standard lesson, 1 hour 30 minutes on Tue 15 Sep at 10:00 with Emma Clarke');
    expect(email.html).toContain('https://example.com/app/receipts/payment-1');
    expect(email.text).not.toContain('VAT');
    expect(email.html).not.toMatch(DASHES);
    expect(email.text).toMatchSnapshot();
  });

  it('for a Business registered for VAT: its VAT number, and the VAT in the price', async () => {
    const email = await render({ vatNumber: 'GB123456789', vatRatePercent: 20, vatPence: 1033 });

    expect(email.text).toContain('VAT number GB123456789');
    expect(email.text).toContain('VAT at 20% included');
    expect(email.text).toContain('£10.33');
    expect(email.html).not.toMatch(DASHES);
    expect(email.text).toMatchSnapshot();
  });

  it('for a fee, and for credit bought in person', async () => {
    expect((await render({ kind: 'no_show_fee', amountPence: 4200, method: 'card' })).text).toContain('No-show fee for the lesson on Tue 15 Sep at 10:00');
    const credit = await render({ kind: 'credit', creditMinutes: 600, amountPence: 38000, method: 'cash', lessonStartsAt: null });
    expect(credit.text).toContain('10 hours of lesson credit');
    expect(credit.text).toContain('Paid in cash');
  });
});
