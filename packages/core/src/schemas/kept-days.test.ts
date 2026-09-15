import { describe, expect, it } from 'vitest';
import { keptDaysSchema } from './kept-days.ts';

describe('asking for the days a phone keeps (PRG-09, M4-09)', () => {
  it('keeps today and tomorrow unless asked for more', () => {
    expect(keptDaysSchema.parse({})).toEqual({ days: 2 });
    expect(keptDaysSchema.parse({ days: '3' })).toEqual({ days: 3 });
  });

  it('keeps at least today and at most a week, in whole days', () => {
    for (const days of ['0', '8', '1.5', 'tomorrow', '']) {
      expect(keptDaysSchema.safeParse({ days }).success, days).toBe(false);
    }
    expect(keptDaysSchema.parse({ days: '7' })).toEqual({ days: 7 });
  });
});
