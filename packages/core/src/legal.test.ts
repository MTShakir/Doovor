import { describe, expect, it } from 'vitest';
import { legalDate, legalDocuments, termsFor, termsVersion } from './legal.ts';

describe('what somebody agrees to (NFR-PRV-02, D-265)', () => {
  it("is the learners' terms for a learner, and the business terms for an instructor or a school", () => {
    expect(termsFor('learner')).toBe(legalDocuments.learnerTerms);
    expect(termsFor('instructor')).toBe(legalDocuments.businessTerms);
    expect(termsFor('school')).toBe(legalDocuments.businessTerms);
  });

  it('is versioned by the newest of the documents, so changing any one asks everybody again', () => {
    const dates = Object.values(legalDocuments).map((document) => document.updated);
    expect(termsVersion).toBe([...dates].sort().at(-1));
    expect(termsVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('prints a date the way the legal pages do', () => {
    expect(legalDate('2026-09-30')).toBe('30 September 2026');
    expect(legalDate('2027-01-05')).toBe('5 January 2027');
  });
});
