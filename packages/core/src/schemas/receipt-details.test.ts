import { describe, expect, it } from 'vitest';
import { normaliseVatNumber, receiptDetailsSchema } from './receipt-details.ts';

describe('what a Business puts on its receipts (PAY-08, M3-20)', () => {
  it('reads a UK VAT number however it is typed, and nothing else', () => {
    expect(normaliseVatNumber('gb 123 4567 89')).toBe('GB123456789');
    expect(normaliseVatNumber('GB123456789012')).toBe('GB123456789012');
    expect(normaliseVatNumber('XI123456789')).toBe('XI123456789');
    expect(normaliseVatNumber('GBGD001')).toBe('GBGD001');
    expect(normaliseVatNumber('123456789')).toBeNull();
    expect(normaliseVatNumber('GB12345678')).toBeNull();
    expect(normaliseVatNumber('FR12345678901')).toBeNull();
  });

  it('takes an address with its postcode tidied, and a VAT number only when there is one', () => {
    const parsed = receiptDetailsSchema.parse({ line1: ' 4 Quay Street ', town: 'Manchester', postcode: 'm12qf', vatNumber: '' });
    expect(parsed).toEqual({ line1: '4 Quay Street', line2: '', town: 'Manchester', postcode: 'M1 2QF', vatNumber: null });

    expect(receiptDetailsSchema.parse({ line1: 'A', town: 'B', postcode: 'LS6 3QS', vatNumber: 'gb123456789' }).vatNumber).toBe('GB123456789');
  });

  it('says what is wrong with an address or a VAT number', () => {
    const result = receiptDetailsSchema.safeParse({ line1: '', town: '', postcode: 'nowhere', vatNumber: '123' });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);
    expect(messages).toEqual([
      'Add the first line of the address',
      'Add the town or city',
      'Enter a UK postcode, like M1 2QF',
      'Enter a UK VAT number, like GB123456789, or leave it empty',
    ]);
  });
});
