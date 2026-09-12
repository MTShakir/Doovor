import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingAreaSchema, onboardingBadgeSchema, onboardingPricesSchema } from './onboarding.ts';

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

describe('area step (COV-01, M1-07)', () => {
  it('tidies the postcode the way it is printed', () => {
    expect(onboardingAreaSchema.parse({ postcode: ' ls6 3hn ', radiusMiles: 8 })).toEqual({
      postcode: 'LS6 3HN',
      radiusMiles: 8,
    });
  });

  it('takes a radius typed as text, because a form field gives one', () => {
    expect(onboardingAreaSchema.parse({ postcode: 'LS6 3HN', radiusMiles: '12' }).radiusMiles).toBe(12);
  });

  it('keeps the radius inside the range the product sets', () => {
    for (const radiusMiles of [0, 31, 8.5]) {
      expect(onboardingAreaSchema.safeParse({ postcode: 'LS6 3HN', radiusMiles }).success).toBe(false);
    }
    expect(onboardingAreaSchema.safeParse({ postcode: 'LS6 3HN', radiusMiles: 1 }).success).toBe(true);
    expect(onboardingAreaSchema.safeParse({ postcode: 'LS6 3HN', radiusMiles: 30 }).success).toBe(true);
  });

  it('says what a postcode looks like when it is given something else', () => {
    const result = onboardingAreaSchema.safeParse({ postcode: 'Leeds', radiusMiles: 8 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a UK postcode like LS1 4DY');
  });
});

describe('prices step (R-05, PAY-04, M1-08)', () => {
  it('takes pounds and stores pence', () => {
    expect(onboardingPricesSchema.parse({ hourlyPrice: '42', packagePrice: '380' })).toEqual({
      hourlyPrice: 4200,
      packagePrice: 38000,
    });
    expect(onboardingPricesSchema.parse({ hourlyPrice: '£42.50', packagePrice: '' }).hourlyPrice).toBe(4250);
  });

  it('treats an empty package as no package, because it is optional', () => {
    expect(onboardingPricesSchema.parse({ hourlyPrice: '42', packagePrice: '' }).packagePrice).toBeNull();
  });

  it('refuses a price that is not a price', () => {
    for (const hourlyPrice of ['', 'forty two', '42.999', '-42']) {
      expect(onboardingPricesSchema.safeParse({ hourlyPrice, packagePrice: '' }).success).toBe(false);
    }
  });

  it('keeps prices inside a sensible range, and says the range', () => {
    const result = onboardingPricesSchema.safeParse({ hourlyPrice: '4', packagePrice: '' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter an hourly price between £5 and £500');
    expect(onboardingPricesSchema.safeParse({ hourlyPrice: '501', packagePrice: '' }).success).toBe(false);
    expect(onboardingPricesSchema.safeParse({ hourlyPrice: '500', packagePrice: '5000' }).success).toBe(true);
  });
});
