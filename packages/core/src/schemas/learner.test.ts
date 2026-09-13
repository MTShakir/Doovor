import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { experienceLevels, learnerOnboardingSchema, learnerTransmissions } from './learner.ts';

const valid = {
  fullName: 'Jack Taylor',
  postcode: 'ls6 1ab',
  transmission: 'manual' as const,
  experienceLevel: 'none' as const,
  dateOfBirth: '2008-04-02',
};

function problem(input: Record<string, unknown>): string[] {
  const result = learnerOnboardingSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('learner onboarding (AUTH-06, M2-01)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes the five answers and tidies the postcode', () => {
    expect(learnerOnboardingSchema.parse(valid)).toEqual({ ...valid, postcode: 'LS6 1AB' });
  });

  it('refuses someone under sixteen, and says why', () => {
    const result = learnerOnboardingSchema.safeParse({ ...valid, dateOfBirth: '2010-09-13' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('You have to be 16 to start learning to drive');
  });

  it('takes someone on their sixteenth birthday', () => {
    expect(learnerOnboardingSchema.safeParse({ ...valid, dateOfBirth: '2010-09-12' }).success).toBe(true);
  });

  it('needs a real date, a real postcode and a name', () => {
    expect(problem({ ...valid, dateOfBirth: 'a while ago' })).toEqual(['dateOfBirth']);
    expect(problem({ ...valid, dateOfBirth: '1899-01-01' })).toEqual(['dateOfBirth']);
    expect(problem({ ...valid, postcode: 'Leeds' })).toEqual(['postcode']);
    expect(problem({ ...valid, fullName: '  ' })).toEqual(['fullName']);
  });

  it('offers the choices the database has', () => {
    expect(learnerTransmissions.map((t) => t.value)).toEqual(['manual', 'automatic']);
    expect(experienceLevels.map((e) => e.value)).toEqual(['none', 'some', 'test_booked']);
    expect(problem({ ...valid, experienceLevel: 'expert' })).toEqual(['experienceLevel']);
  });
});
