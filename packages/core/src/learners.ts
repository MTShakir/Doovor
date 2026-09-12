/**
 * The people an instructor teaches, as the list screen thinks of them (LRN-01, LRN-05).
 *
 * A learner belongs to a Business with one status. The list offers four filters for the six
 * statuses, so each filter covers the statuses that mean the same thing to someone looking
 * for a person rather than a state (D-065).
 */

export const learnerStatuses = ['enquiry', 'waiting', 'active', 'test_booked', 'passed', 'left'] as const;

export type LearnerStatus = (typeof learnerStatuses)[number];

export const learnerStatusLabels: Record<LearnerStatus, string> = {
  enquiry: 'Enquiry',
  waiting: 'Waiting',
  active: 'Active',
  test_booked: 'Test booked',
  passed: 'Passed',
  left: 'Left',
};

export const learnerFilters = ['all', 'active', 'waiting', 'passed', 'inactive'] as const;

export type LearnerFilter = (typeof learnerFilters)[number];

export const learnerFilterLabels: Record<LearnerFilter, string> = {
  all: 'Everyone',
  active: 'Active',
  waiting: 'Waiting',
  passed: 'Passed',
  inactive: 'Inactive',
};

const filterStatuses: Record<LearnerFilter, readonly LearnerStatus[]> = {
  all: learnerStatuses,
  // Learning now, test booked or not.
  active: ['active', 'test_booked'],
  // Asked about lessons, or waiting for a slot: someone to get back to.
  waiting: ['enquiry', 'waiting'],
  passed: ['passed'],
  inactive: ['left'],
};

/** Which statuses a filter shows. Every status is under exactly one of the four. */
export function statusesForFilter(filter: LearnerFilter): readonly LearnerStatus[] {
  return filterStatuses[filter];
}

export function isLearnerFilter(value: unknown): value is LearnerFilter {
  return typeof value === 'string' && (learnerFilters as readonly string[]).includes(value);
}

/** A filter from the address bar, where anything at all can be typed. */
export function learnerFilterFrom(value: string | undefined): LearnerFilter {
  return isLearnerFilter(value) ? value : 'all';
}

const likeWildcards = /[\\%_]/g;
const writtenAsNumber = /^[\d\s+()-]+$/;

/**
 * What the search box asks the database for. A number is reduced to the digits that do not
 * change between the ways people write one, so 07700 900123 finds +447700900123. Anything
 * else is matched as typed, with the characters `like` treats as wildcards escaped.
 */
export function searchPattern(term: string): string {
  const trimmed = term.trim();
  if (trimmed === '') return '';
  const value = writtenAsNumber.test(trimmed)
    ? trimmed.replace(/\D/g, '').replace(/^0+/, '')
    : trimmed.toLowerCase();
  return value === '' ? '' : `%${value.replace(likeWildcards, (match) => `\\${match}`)}%`;
}

/** What the list says under a learner's name about the lessons behind them. */
export function lessonsTakenLine(lessonsTaken: number): string {
  if (lessonsTaken === 0) return 'No lessons yet';
  return lessonsTaken === 1 ? '1 lesson' : `${String(lessonsTaken)} lessons`;
}

/** How many people the list is showing, said aloud when a filter changes. */
export function learnerCountLine(count: number): string {
  return count === 1 ? '1 learner' : `${String(count)} learners`;
}
