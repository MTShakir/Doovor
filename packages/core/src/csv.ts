/**
 * Reading a spreadsheet of learners (LRN-03, M2-09).
 *
 * Instructors export from wherever they keep their book: a spreadsheet, another app, their
 * phone contacts. So this reads what those actually produce rather than what a standard
 * says: commas or semicolons or tabs, quoted fields with commas and line breaks inside them,
 * Windows line endings, and the byte order mark Excel puts at the front.
 */

import { normaliseUkMobile } from './phone.ts';

export type CsvRow = string[];

const DELIMITERS = [',', ';', '\t'] as const;

/** Whichever separator the first line uses most. Excel picks by locale, not by rule. */
export function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, 5000).split(/\r?\n/)[0] ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of DELIMITERS) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Rows of cells. Blank lines are dropped: a spreadsheet is full of them. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): CsvRow[] {
  // Excel writes a byte order mark at the front, which is not part of the first header.
  const input = text.replace(/^\uFEFF/, '');
  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i += 1) {
    const character = input[i] ?? '';
    if (quoted) {
      if (character === '"') {
        // Two quotes inside a quoted field are one quote.
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
      continue;
    }
    if (character === delimiter) {
      endCell();
      continue;
    }
    if (character === '\n') {
      endRow();
      continue;
    }
    if (character === '\r') continue;
    cell += character;
  }
  if (cell !== '' || row.length > 0) endRow();

  return rows;
}

export const importFields = ['fullName', 'phone', 'email', 'postcode'] as const;

export type ImportField = (typeof importFields)[number];

export type ColumnMapping = Record<ImportField, number | null>;

const headerWords: Record<ImportField, string[]> = {
  fullName: ['name', 'learner', 'pupil', 'student', 'full name', 'first name', 'contact'],
  phone: ['phone', 'mobile', 'number', 'tel', 'telephone', 'cell'],
  email: ['email', 'e mail', 'address', 'mail'],
  postcode: ['postcode', 'post code', 'zip', 'area'],
};

function tidy(value: string): string {
  return value.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A first guess at which column is which, from the header row. It is only a guess: the
 * screen shows it and the instructor can change it.
 */
export function guessColumns(header: CsvRow): ColumnMapping {
  const mapping: ColumnMapping = { fullName: null, phone: null, email: null, postcode: null };
  const taken = new Set<number>();

  for (const field of importFields) {
    const words = headerWords[field];
    const index = header.findIndex((cell, at) => {
      if (taken.has(at)) return false;
      const value = tidy(cell);
      return value !== '' && words.some((word) => value === word || value.includes(word));
    });
    if (index !== -1) {
      mapping[field] = index;
      taken.add(index);
    }
  }
  return mapping;
}

/** True when the first row names its columns rather than being somebody's details. */
export function looksLikeHeader(row: CsvRow): boolean {
  const guesses = guessColumns(row);
  return Object.values(guesses).filter((index) => index !== null).length >= 2;
}

export interface ImportCandidate {
  /** The line in the file, counting the header, so a person can find it again. */
  line: number;
  fullName: string;
  phone: string;
  email: string;
  postcode: string;
}

export function readRows(rows: CsvRow[], mapping: ColumnMapping, hasHeader: boolean): ImportCandidate[] {
  const cell = (row: CsvRow, index: number | null): string => (index === null ? '' : (row[index] ?? '').trim());

  return rows.slice(hasHeader ? 1 : 0).map((row, at) => ({
    line: at + (hasHeader ? 2 : 1),
    fullName: cell(row, mapping.fullName),
    phone: cell(row, mapping.phone),
    email: cell(row, mapping.email),
    postcode: cell(row, mapping.postcode),
  }));
}

export interface ImportProblem {
  line: number;
  name: string;
  reason: string;
}

export interface ImportReview {
  ready: ImportCandidate[];
  problems: ImportProblem[];
}

/**
 * Which rows can be imported, and what is wrong with the rest. Rows that repeat a number or
 * an address already seen in the same file are held back: a spreadsheet exported twice and
 * pasted together is the usual way a list ends up with everybody in it twice.
 */
export function reviewRows(
  candidates: ImportCandidate[],
  check: (row: ImportCandidate) => string | null,
): ImportReview {
  const ready: ImportCandidate[] = [];
  const problems: ImportProblem[] = [];
  const seen = new Map<string, number>();

  for (const candidate of candidates) {
    const reason = check(candidate);
    if (reason !== null) {
      problems.push({ line: candidate.line, name: candidate.fullName, reason });
      continue;
    }

    // The same number written two ways is the same number (07700 900123, +44 7700 900123).
    const number = normaliseUkMobile(candidate.phone) ?? candidate.phone.replace(/\D/g, '');
    const keys = [number, candidate.email.toLowerCase()].filter((key) => key !== '');
    const twice = keys.map((key) => seen.get(key)).find((line) => line !== undefined);
    if (twice !== undefined) {
      problems.push({ line: candidate.line, name: candidate.fullName, reason: `Same details as line ${String(twice)}` });
      continue;
    }
    for (const key of keys) seen.set(key, candidate.line);
    ready.push(candidate);
  }

  return { ready, problems };
}
