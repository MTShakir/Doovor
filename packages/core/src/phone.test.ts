import { describe, expect, it } from 'vitest';
import { formatUkMobile, normaliseUkMobile, whatsAppTo } from './phone.ts';

describe('UK mobile numbers (AUTH-02)', () => {
  it('reads the forms people write, and refuses what is not a UK mobile', () => {
    for (const written of ['07700 900001', '+44 7700 900001', '0044 7700 900001', '(07700) 900-001']) {
      expect(normaliseUkMobile(written)).toBe('+447700900001');
    }
    for (const no of ['0121 496 0000', '07700 90000', 'not a number', '']) expect(normaliseUkMobile(no)).toBeNull();
  });

  it('shows a number the way it is written down here', () => {
    expect(formatUkMobile('+447700900001')).toBe('07700 900001');
    expect(formatUkMobile('447700900001')).toBe('07700 900001');
    expect(formatUkMobile('anything else')).toBe('anything else');
  });
});

describe('a link to a WhatsApp chat (D-194)', () => {
  it('keeps the country code and drops everything that is not a digit', () => {
    expect(whatsAppTo('+447700900001')).toBe('https://wa.me/447700900001');
    expect(whatsAppTo('+44 7700 900 001')).toBe('https://wa.me/447700900001');
  });
});
