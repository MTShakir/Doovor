import { describe, expect, it } from 'vitest';
import { feeTermsWords, firstFeeOn, schoolFeeTermsSchema, settleFeeSchema } from './school-fees.ts';

const linkId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const terms = { linkId, period: 'weekly', fee: '50', startsOn: '2026-11-02', freeWeeks: '2', pupilFee: '20' };

describe('what a linked instructor pays the school (M9-11, D-287)', () => {
  it('takes the fee and the fee for a pupil in pounds, and the free weeks as a number', () => {
    expect(schoolFeeTermsSchema.parse(terms)).toEqual({ linkId, period: 'weekly', fee: 5000, startsOn: '2026-11-02', freeWeeks: 2, pupilFee: 2000 });
    expect(schoolFeeTermsSchema.parse({ ...terms, freeWeeks: '' }).freeWeeks).toBe(0);
  });

  it('lets a school charge for pupils alone', () => {
    expect(schoolFeeTermsSchema.parse({ ...terms, period: '', fee: '', startsOn: '' })).toMatchObject({ period: '', fee: null, pupilFee: 2000 });
  });

  it('asks for the fee and its start when there is one, and says what is wrong', () => {
    const missing = schoolFeeTermsSchema.safeParse({ ...terms, fee: '', startsOn: '' });
    expect(missing.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ['fee', 'Enter the fee'],
      ['startsOn', 'Choose when the fees start'],
    ]);
    expect(schoolFeeTermsSchema.safeParse({ ...terms, fee: '0.50' }).error?.issues[0]?.message).toBe('Enter an amount between £1 and £2,000');
    expect(schoolFeeTermsSchema.safeParse({ ...terms, freeWeeks: '53' }).error?.issues[0]?.message).toBe('Enter 52 weeks or fewer');
    expect(schoolFeeTermsSchema.safeParse({ ...terms, startsOn: '2026-02-30' }).error?.issues[0]?.message).toBe('Enter a date');
  });

  it('settles a fee as paid, written off or owed again, with a short note', () => {
    expect(settleFeeSchema.parse({ feeId: linkId, outcome: 'paid' })).toEqual({ feeId: linkId, outcome: 'paid', note: '' });
    expect(settleFeeSchema.safeParse({ feeId: linkId, outcome: 'refunded' }).success).toBe(false);
  });

  it('starts the first fee after the free weeks', () => {
    expect(firstFeeOn('2026-11-02', 0)).toBe('2026-11-02');
    expect(firstFeeOn('2026-11-02', 2)).toBe('2026-11-16');
  });

  it('says the terms in words', () => {
    expect(feeTermsWords({ period: 'weekly', feePence: 5000, startsOn: '2026-11-02', freeWeeks: 2, pupilFeePence: 2000 }, 'Mon 16 Nov')).toEqual([
      '£50 a week, the first due Mon 16 Nov, after 2 free weeks',
      '£20 for each pupil the school introduces',
    ]);
    expect(feeTermsWords({ period: 'monthly', feePence: 20000, startsOn: '2026-11-02', freeWeeks: 1, pupilFeePence: null }, 'Mon 9 Nov')).toEqual([
      '£200 a month, the first due Mon 9 Nov, after 1 free week',
    ]);
    expect(feeTermsWords({ period: null, feePence: null, startsOn: null, freeWeeks: 0, pupilFeePence: null }, null)).toEqual(['No fees']);
  });
});
