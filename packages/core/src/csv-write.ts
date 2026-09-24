/**
 * Writing a CSV file that a spreadsheet or MTD software will read back (MNY-04, D-198).
 *
 * The rules are the boring ones and they matter: a field with a comma, a quote or a newline in it
 * is quoted and its quotes doubled, rows end with CRLF, and the file opens with a byte order mark
 * so Excel reads it as UTF-8 rather than guessing at the pound signs.
 */

/** A value as it goes into a cell. Numbers are written by the caller, so pence stay pence. */
export type CsvValue = string | number | null | undefined;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The byte order mark, so a spreadsheet reads the file as UTF-8. */
export const csvByteOrderMark = '﻿';

export function toCsv(rows: readonly (readonly CsvValue[])[], options: { byteOrderMark?: boolean } = {}): string {
  const body = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  const ending = rows.length > 0 ? '\r\n' : '';
  return `${options.byteOrderMark === false ? '' : csvByteOrderMark}${body}${ending}`;
}

/** Pence as a spreadsheet wants them: a plain decimal, no symbol, no thousands separator. */
export function csvPence(pence: number): string {
  const negative = pence < 0;
  const absolute = Math.abs(Math.round(pence));
  return `${negative ? '-' : ''}${String(Math.floor(absolute / 100))}.${String(absolute % 100).padStart(2, '0')}`;
}
