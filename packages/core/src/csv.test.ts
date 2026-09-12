import { describe, expect, it } from 'vitest';
import {
  detectDelimiter,
  guessColumns,
  looksLikeHeader,
  parseCsv,
  readRows,
  reviewRows,
  type ColumnMapping,
  type ImportCandidate,
} from './csv.ts';

describe('parseCsv (LRN-03, M2-09)', () => {
  it('reads the plain case', () => {
    expect(parseCsv('Name,Phone\nJack,07700900123\n')).toEqual([
      ['Name', 'Phone'],
      ['Jack', '07700900123'],
    ]);
  });

  it('keeps commas and line breaks that are inside quotes', () => {
    const text = 'Name,Address\n"Taylor, Jack","12 High Street\nLeeds"\n';
    expect(parseCsv(text)).toEqual([
      ['Name', 'Address'],
      ['Taylor, Jack', '12 High Street\nLeeds'],
    ]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('Name\n"Jack ""JT"" Taylor"\n')).toEqual([['Name'], ['Jack "JT" Taylor']]);
  });

  it('survives Windows line endings, a byte order mark and blank lines', () => {
    expect(parseCsv('﻿Name,Phone\r\nJack,07700900123\r\n\r\n')).toEqual([
      ['Name', 'Phone'],
      ['Jack', '07700900123'],
    ]);
  });

  it('reads a file without a line break at the end', () => {
    expect(parseCsv('Name\nJack')).toEqual([['Name'], ['Jack']]);
  });

  it('takes the separator the file actually uses', () => {
    expect(detectDelimiter('Name;Phone;Email\n')).toBe(';');
    expect(detectDelimiter('Name\tPhone\tEmail\n')).toBe('\t');
    expect(detectDelimiter('Name,Phone\n')).toBe(',');
    expect(parseCsv('Name;Phone\nJack;07700900123')).toEqual([
      ['Name', 'Phone'],
      ['Jack', '07700900123'],
    ]);
  });
});

describe('guessColumns (LRN-03)', () => {
  it('recognises the headers people actually export', () => {
    expect(guessColumns(['Pupil name', 'Mobile number', 'Email address', 'Post code'])).toEqual({
      fullName: 0,
      phone: 1,
      email: 2,
      postcode: 3,
    });
  });

  it('never puts two fields on one column', () => {
    const mapping = guessColumns(['Contact', 'Contact']);
    expect(mapping.fullName).toBe(0);
    expect(Object.values(mapping).filter((index) => index === 0)).toHaveLength(1);
  });

  it('leaves out what it cannot find', () => {
    expect(guessColumns(['Name', 'Lessons taken'])).toEqual({ fullName: 0, phone: null, email: null, postcode: null });
  });

  it('tells a header row from somebody details', () => {
    expect(looksLikeHeader(['Name', 'Mobile', 'Email'])).toBe(true);
    expect(looksLikeHeader(['Jack Taylor', '07700900123', 'jack@example.com'])).toBe(false);
  });
});

describe('readRows (LRN-03)', () => {
  const mapping: ColumnMapping = { fullName: 0, phone: 1, email: null, postcode: 2 };

  it('numbers the lines the way the spreadsheet does', () => {
    const rows = [
      ['Name', 'Mobile', 'Postcode'],
      ['Jack Taylor', '07700900123', 'LS2 9JT'],
      ['Ruby Shah', '07700900124', 'LS6 3QS'],
    ];

    expect(readRows(rows, mapping, true)).toEqual([
      { line: 2, fullName: 'Jack Taylor', phone: '07700900123', email: '', postcode: 'LS2 9JT' },
      { line: 3, fullName: 'Ruby Shah', phone: '07700900124', email: '', postcode: 'LS6 3QS' },
    ]);
  });

  it('reads a file with no header at all', () => {
    expect(readRows([['Jack Taylor', '07700900123', 'LS2 9JT']], mapping, false)[0]?.line).toBe(1);
  });
});

describe('reviewRows (LRN-03)', () => {
  const row = (line: number, phone: string, email = ''): ImportCandidate => ({
    line,
    fullName: `Person ${String(line)}`,
    phone,
    email,
    postcode: '',
  });

  it('holds back what the check refuses, and says which line it was', () => {
    const review = reviewRows([row(2, '07700900123'), row(3, 'nonsense')], (candidate) =>
      candidate.phone.startsWith('0') ? null : 'That is not a UK mobile number',
    );

    expect(review.ready).toHaveLength(1);
    expect(review.problems).toEqual([{ line: 3, name: 'Person 3', reason: 'That is not a UK mobile number' }]);
  });

  it('imports the first of two rows with the same number, and reports the second', () => {
    const review = reviewRows([row(2, '07700 900123'), row(3, '+447700900123')], () => null);

    expect(review.ready.map((one) => one.line)).toEqual([2]);
    expect(review.problems[0]?.reason).toBe('Same details as line 2');
  });

  it('spots the same address written in different cases', () => {
    const review = reviewRows([row(2, '', 'Jack@Example.com'), row(3, '', 'jack@example.com')], () => null);

    expect(review.ready).toHaveLength(1);
    expect(review.problems).toHaveLength(1);
  });

  it('lets two people with no contact details through to the check, not the duplicate rule', () => {
    const review = reviewRows([row(2, ''), row(3, '')], () => null);

    expect(review.ready).toHaveLength(2);
  });
});

describe('a real sized file (LRN-03)', () => {
  it('reads 120 rows and says exactly which ones cannot go in', () => {
    const lines = ['Pupil name,Mobile,Email,Postcode'];
    for (let n = 0; n < 120; n += 1) {
      const number = `07700 9${String(100000 + n).slice(-5)}`;
      lines.push(`Learner ${String(n)},${number},learner${String(n)}@example.com,LS${String((n % 9) + 1)} 4DY`);
    }
    // Three rows a real export always seems to contain.
    lines[10] = 'No Contact,,,LS1 4DY';
    lines[20] = lines[19] ?? '';
    lines[30] = ',,,';

    const rows = parseCsv(lines.join(String.fromCharCode(13, 10)));
    const mapping = guessColumns(rows[0] ?? []);
    const candidates = readRows(rows, mapping, true);
    const review = reviewRows(candidates, (candidate) =>
      candidate.fullName === '' ? 'Add their name' : candidate.phone === '' && candidate.email === '' ? 'Add a way of reaching them' : null,
    );

    expect(candidates).toHaveLength(119);
    expect(review.ready).toHaveLength(117);
    expect(review.problems.map((problem) => problem.line)).toEqual([11, 21]);
    expect(review.problems[1]?.reason).toBe('Same details as line 20');
  });
});
