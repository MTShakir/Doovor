import { describe, expect, it } from 'vitest';
import { auditActionWords, auditCategories, auditCategoryActions, auditWords } from './audit.ts';

describe('the audit log in words (ADM-07, NFR-SEC-06, M5-22)', () => {
  it('has a kind for everything NFR-SEC-06 names', () => {
    expect(auditCategories.filter((category) => category.required).map((category) => category.label)).toEqual([
      'Sign-ins',
      'Role changes',
      'Verification decisions',
      'Refunds',
      'Payout and payment changes',
      'Data exports',
      'Account deletions',
      'Viewing as somebody',
    ]);
  });

  it('puts every action with words in exactly one kind, and every action in a kind has words', () => {
    const inKinds = auditCategories.flatMap((category) => category.actions);
    expect(new Set(inKinds).size).toBe(inKinds.length);
    expect([...inKinds].sort()).toEqual(Object.keys(auditActionWords).sort());
  });

  it('says what happened, or shows an action it does not know as it was recorded', () => {
    expect(auditWords('refund.issued')).toBe('Refund issued');
    expect(auditWords('something.new')).toBe('something.new');
  });

  it('gives the actions of a kind, and none for no kind', () => {
    expect(auditCategoryActions('viewing')).toEqual(['impersonation.started', 'impersonation.ended']);
    expect(auditCategoryActions('')).toBeNull();
    expect(auditCategoryActions('nonsense')).toBeNull();
  });
});
