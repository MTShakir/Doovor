import { describe, expect, it } from 'vitest';
import { availabilityExceptionSchema, workingWeekSchema } from './availability.ts';

function week(overrides: Partial<Record<number, { working: boolean; startTime: string; endTime: string }>> = {}) {
  return {
    days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      working: weekday <= 5,
      startTime: '09:00',
      endTime: '18:00',
      ...overrides[weekday],
    })),
  };
}

function problem(schema: { safeParse: (input: unknown) => { success: boolean; error?: { issues: { path: (string | number | symbol)[] }[] } } }, input: unknown) {
  const result = schema.safeParse(input);
  return result.success ? [] : (result.error?.issues.map((issue) => issue.path.join('.')) ?? []);
}

describe('working week (DIA-01, M1-17)', () => {
  it('takes seven days, some worked and some not', () => {
    expect(workingWeekSchema.parse(week()).days).toHaveLength(7);
  });

  it('is a week, not some days', () => {
    expect(problem(workingWeekSchema, { days: [] })).toEqual(['days']);
  });

  it('will not let a working day finish before it starts', () => {
    expect(problem(workingWeekSchema, week({ 2: { working: true, startTime: '18:00', endTime: '09:00' } }))).toEqual([
      'days.1.endTime',
    ]);
  });

  it('does not mind the times on a day that is not worked', () => {
    expect(workingWeekSchema.safeParse(week({ 7: { working: false, startTime: '18:00', endTime: '09:00' } })).success).toBe(
      true,
    );
  });
});

describe('exceptions (DIA-02, M1-17)', () => {
  const valid = { kind: 'blocked' as const, date: '2026-10-01', startTime: '09:00', endTime: '12:00', reason: 'Car service' };

  it('takes time off with a reason, and an open slot without one', () => {
    expect(availabilityExceptionSchema.parse(valid).reason).toBe('Car service');
    expect(availabilityExceptionSchema.parse({ ...valid, kind: 'open', reason: '' }).kind).toBe('open');
  });

  it('needs a real date and times that make sense', () => {
    expect(problem(availabilityExceptionSchema, { ...valid, date: 'tomorrow' })).toEqual(['date']);
    expect(problem(availabilityExceptionSchema, { ...valid, endTime: '08:00' })).toEqual(['endTime']);
    expect(problem(availabilityExceptionSchema, { ...valid, startTime: 'nine' })).toEqual(['startTime']);
  });

  it('keeps the reason short enough to read in a list', () => {
    expect(problem(availabilityExceptionSchema, { ...valid, reason: 'x'.repeat(201) })).toEqual(['reason']);
  });
});
