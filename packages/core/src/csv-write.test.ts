import { describe, expect, it } from 'vitest';
import { csvByteOrderMark, csvPence, toCsv } from './csv-write.ts';

describe('writing a CSV a spreadsheet will read back (MNY-04, D-198)', () => {
  it('writes rows ending CRLF, opening with a byte order mark', () => {
    expect(toCsv([['a', 'b'], ['c', 'd']])).toBe(`${csvByteOrderMark}a,b\r\nc,d\r\n`);
  });

  it('quotes a field with a comma, a quote or a newline, and doubles the quotes', () => {
    expect(toCsv([['Fuel, petrol']], { byteOrderMark: false })).toBe('"Fuel, petrol"\r\n');
    expect(toCsv([['He said "hello"']], { byteOrderMark: false })).toBe('"He said ""hello"""\r\n');
    expect(toCsv([['Two\nlines']], { byteOrderMark: false })).toBe('"Two\nlines"\r\n');
  });

  it('leaves an empty cell for nothing at all', () => {
    expect(toCsv([[null, undefined, '']], { byteOrderMark: false })).toBe(',,\r\n');
    expect(toCsv([], { byteOrderMark: false })).toBe('');
  });

  it('writes numbers as they were given, so pence stay pence', () => {
    expect(toCsv([[42, 0]], { byteOrderMark: false })).toBe('42,0\r\n');
  });
});

describe('pence in a spreadsheet', () => {
  it('writes a plain decimal with no symbol', () => {
    expect(csvPence(4250)).toBe('42.50');
    expect(csvPence(5)).toBe('0.05');
    expect(csvPence(0)).toBe('0.00');
    expect(csvPence(100000)).toBe('1000.00');
  });

  it('writes a loss with its sign in front', () => {
    expect(csvPence(-4250)).toBe('-42.50');
    expect(csvPence(-5)).toBe('-0.05');
  });
});
