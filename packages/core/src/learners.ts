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

/** What each status means, in the words the screen uses to explain the choice (LRN-05). */
export const learnerStatusHints: Record<LearnerStatus, string> = {
  enquiry: 'Asked about lessons, nothing booked yet',
  waiting: 'Ready to start, waiting for a slot',
  active: 'Having lessons now',
  test_booked: 'Has a practical test coming up',
  passed: 'Passed their test',
  left: 'Not learning with you any more',
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

export interface LearnerEvent {
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actorName: string;
}

function text(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * One line of a learner's history (LRN-06). Anything we have no sentence for is left out
 * rather than shown as a code: the history is for the instructor, not for us.
 */
export function learnerEventLine(event: LearnerEvent): string | null {
  if (event.action === 'learner.added') {
    const source = text(event.after, 'source');
    return source === 'import' ? `Imported by ${event.actorName}` : `Added by ${event.actorName}`;
  }
  if (event.action === 'learner.reassigned') {
    const was = text(event.before, 'instructor_name');
    const now = text(event.after, 'instructor_name');
    if (now === null) return `Moved by ${event.actorName}`;
    return was === null ? `Given to ${now} by ${event.actorName}` : `Moved from ${was} to ${now} by ${event.actorName}`;
  }
  if (event.action === 'learner.status_changed') {
    const was = text(event.before, 'status');
    const now = text(event.after, 'status');
    if (was === null || now === null) return null;
    const label = (status: string): string =>
      isLearnerStatus(status) ? learnerStatusLabels[status].toLowerCase() : status;
    const reason = text(event.after, 'reason');
    const line = `Moved from ${label(was)} to ${label(now)} by ${event.actorName}`;
    return reason === null ? line : `${line}: ${reason}`;
  }
  return null;
}

export function isLearnerStatus(value: unknown): value is LearnerStatus {
  return typeof value === 'string' && (learnerStatuses as readonly string[]).includes(value);
}
