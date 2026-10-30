import { format } from 'date-fns';
import { parseLocalDate, type LocalDate } from './time/calendar.ts';

/**
 * The documents somebody agrees to, and when each was last changed (NFR-PRV-02, PRD 15, D-265).
 *
 * The pages print these dates, and the version somebody agrees to is the newest of them, so a page
 * whose date moves on asks everybody to agree again rather than holding them to words they never
 * saw. A learner agrees to the learners' terms, an instructor or a school to the business terms,
 * and everybody is shown the privacy notice.
 */
export const legalDocuments = {
  learnerTerms: { title: 'Terms for learners', path: '/terms', updated: '2026-10-20' },
  businessTerms: { title: 'Terms for instructors', path: '/business-terms', updated: '2026-10-20' },
  privacy: { title: 'Privacy notice', path: '/privacy', updated: '2026-10-30' },
} as const satisfies Record<string, { title: string; path: string; updated: LocalDate }>;

export type LegalDocument = (typeof legalDocuments)[keyof typeof legalDocuments];

/** Who somebody is agreeing as, which decides whose terms they are. */
export type AgreeingAs = 'learner' | 'instructor' | 'school';

/** The terms that apply: a learner's own, or the ones a Business agrees to. */
export function termsFor(as: AgreeingAs): LegalDocument {
  return as === 'learner' ? legalDocuments.learnerTerms : legalDocuments.businessTerms;
}

/** The version somebody agrees to: the day the newest of the documents was last changed. */
export const termsVersion: LocalDate = Object.values(legalDocuments)
  // Widened to any date, so the newest is found whichever document changed last.
  .map((document): LocalDate => document.updated)
  .reduce((newest, date) => (date > newest ? date : newest));

/** How a legal page prints its date: "30 September 2026". */
export function legalDate(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date);
  return format(new Date(year, month - 1, day), 'd MMMM yyyy');
}
