import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { experienceLevels, learnerHealthSchema, learnerOnboardingSchema, learnerTransmissions } from './learner.ts';

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

describe('the disability question at sign-up (LRN-02, D-180)', () => {
  it('finishes with nothing chosen, which the browser sends as an empty answer', () => {
    const answers = learnerOnboardingSchema.safeParse({ ...valid, hasDisability: '', disabilityDetails: '' });
    expect(answers.success).toBe(true);
    expect(answers.data?.hasDisability).toBeUndefined();
  });

  it('takes a yes with what would help, and asks for it when it is missing', () => {
    expect(learnerOnboardingSchema.safeParse({ ...valid, hasDisability: 'yes', disabilityDetails: 'Needs quieter roads' }).success).toBe(true);
    const empty = learnerOnboardingSchema.safeParse({ ...valid, hasDisability: 'yes' });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.path).toEqual(['disabilityDetails']);
  });
});

describe('what a learner tells us about a disability (LRN-02, D-180)', () => {
  it('takes a plain no, with nothing else to say', () => {
    expect(learnerHealthSchema.safeParse({ hasDisability: 'no' }).success).toBe(true);
  });

  it('takes a yes with what would help', () => {
    const answer = learnerHealthSchema.safeParse({ hasDisability: 'yes', details: 'Dyslexia: written notes are hard' });
    expect(answer.success).toBe(true);
  });

  it('asks what would help before it takes a yes, since a yes alone tells an instructor nothing', () => {
    const answer = learnerHealthSchema.safeParse({ hasDisability: 'yes', details: '   ' });
    expect(answer.success).toBe(false);
    expect(answer.error?.issues[0]?.message).toBe('Say what would help, so your instructor can plan for it');
    expect(answer.error?.issues[0]?.path).toEqual(['details']);
  });

  it('keeps what they write to a length somebody can read', () => {
    expect(learnerHealthSchema.safeParse({ hasDisability: 'yes', details: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('is not answered by anything but yes or no', () => {
    expect(learnerHealthSchema.safeParse({ hasDisability: 'maybe' }).success).toBe(false);
    expect(learnerHealthSchema.safeParse({}).success).toBe(false);
  });
});
