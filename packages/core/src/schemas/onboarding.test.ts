import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingBadgeSchema } from './onboarding.ts';

const valid = {
  qualification: 'adi' as const,
  badgeNumber: '123456',
  badgeExpiry: '2027-03-01',
  dbsConfirmed: true,
};

function problem(input: Record<string, unknown>): string[] {
  const result = onboardingBadgeSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('badge step (INS-02, M1-04)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a badge that has not expired', () => {
    expect(onboardingBadgeSchema.parse(valid)).toMatchObject({ qualification: 'adi', badgeNumber: '123456' });
  });

  it('tidies the number the way it is printed', () => {
    expect(onboardingBadgeSchema.parse({ ...valid, badgeNumber: ' ab1234 ' }).badgeNumber).toBe('AB1234');
  });

  it('refuses a badge that has already expired', () => {
    expect(problem({ ...valid, badgeExpiry: '2026-09-11' })).toEqual(['badgeExpiry']);
  });

  it('refuses today, because a badge expires at the end of its last day and we do not know when that is', () => {
    expect(problem({ ...valid, badgeExpiry: '2026-09-12' })).toEqual(['badgeExpiry']);
  });

  it('refuses a date that is not a date', () => {
    expect(problem({ ...valid, badgeExpiry: '31/03/2027' })).toEqual(['badgeExpiry']);
    expect(problem({ ...valid, badgeExpiry: '2027-02-31' })).toEqual(['badgeExpiry']);
  });

  it('refuses a number that is not printed on any badge', () => {
    expect(problem({ ...valid, badgeNumber: '12' })).toEqual(['badgeNumber']);
    expect(problem({ ...valid, badgeNumber: '1234-5678' })).toEqual(['badgeNumber']);
  });

  it('will not take a submission without the DBS confirmation', () => {
    expect(problem({ ...valid, dbsConfirmed: false })).toEqual(['dbsConfirmed']);
  });

  it('takes trainee instructors too', () => {
    expect(onboardingBadgeSchema.parse({ ...valid, qualification: 'pdi' }).qualification).toBe('pdi');
  });
});
