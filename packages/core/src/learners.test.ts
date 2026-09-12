import { describe, expect, it } from 'vitest';
import {
  learnerCountLine,
  learnerFilterFrom,
  learnerFilterLabels,
  learnerFilters,
  learnerStatuses,
  learnerStatusHints,
  learnerStatusLabels,
  lessonsTakenLine,
  searchPattern,
  statusesForFilter,
} from './learners.ts';

describe('learner filters (LRN-01)', () => {
  it('shows every status under exactly one filter, so nobody is hidden', () => {
    const named = learnerFilters
      .filter((filter) => filter !== 'all')
      .flatMap((filter) => [...statusesForFilter(filter)]);

    expect([...named].sort()).toEqual([...learnerStatuses].sort());
  });

  it('counts someone with a test booked as active', () => {
    expect(statusesForFilter('active')).toContain('test_booked');
  });

  it('counts an enquiry as someone still waiting to hear back', () => {
    expect(statusesForFilter('waiting')).toContain('enquiry');
  });

  it('shows everyone under the first filter', () => {
    expect(statusesForFilter('all')).toEqual(learnerStatuses);
  });

  it('falls back to everyone when the address bar says something else', () => {
    expect(learnerFilterFrom('active')).toBe('active');
    expect(learnerFilterFrom('nonsense')).toBe('all');
    expect(learnerFilterFrom(undefined)).toBe('all');
  });

  it('has a label for every status and every filter, and says what each status means', () => {
    for (const status of learnerStatuses) {
      expect(learnerStatusLabels[status]).not.toBe('');
      expect(learnerStatusHints[status]).not.toBe('');
    }
    for (const filter of learnerFilters) expect(learnerFilterLabels[filter]).not.toBe('');
  });
});

describe('searchPattern (LRN-01)', () => {
  it('asks for nothing when nothing was typed', () => {
    expect(searchPattern('')).toBe('');
    expect(searchPattern('   ')).toBe('');
  });

  it('matches a name loosely, whatever case it was typed in', () => {
    expect(searchPattern(' Jack ')).toBe('%jack%');
    expect(searchPattern('TAYLOR')).toBe('%taylor%');
  });

  it('finds a number however either side wrote it', () => {
    expect(searchPattern('07700 900123')).toBe('%7700900123%');
    expect(searchPattern('+44 7700 900123')).toBe('%447700900123%');
    expect(searchPattern('(07700) 900-123')).toBe('%7700900123%');
  });

  it('treats the characters like uses as wildcards as ordinary typing', () => {
    expect(searchPattern('100%')).toBe('%100\\%%');
    expect(searchPattern('a_b')).toBe('%a\\_b%');
    expect(searchPattern('a\\b')).toBe('%a\\\\b%');
  });
});

describe('lessonsTakenLine', () => {
  it('counts lessons in plain words', () => {
    expect(lessonsTakenLine(0)).toBe('No lessons yet');
    expect(lessonsTakenLine(1)).toBe('1 lesson');
    expect(lessonsTakenLine(12)).toBe('12 lessons');
  });
});

describe('learnerCountLine', () => {
  it('counts people in plain words', () => {
    expect(learnerCountLine(0)).toBe('0 learners');
    expect(learnerCountLine(1)).toBe('1 learner');
    expect(learnerCountLine(24)).toBe('24 learners');
  });
});
