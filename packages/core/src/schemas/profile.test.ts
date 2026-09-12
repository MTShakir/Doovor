import { describe, expect, it } from 'vitest';
import { instructorProfileSchema, languages, specialisms, transmissions } from './profile.ts';

const valid = {
  displayName: 'Sarah Khan',
  bio: 'Calm, patient instructor.',
  languages: ['English'],
  yearsTeaching: '9',
  transmission: 'manual' as const,
  carMake: 'Volkswagen',
  carModel: 'Polo',
  dualControls: true,
  specialisms: ['nervous_drivers' as const],
};

function problem(input: Record<string, unknown>): string[] {
  const result = instructorProfileSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('instructor profile (INS-01, M1-11)', () => {
  it('takes the fields a learner reads before booking', () => {
    expect(instructorProfileSchema.parse(valid)).toEqual({ ...valid, yearsTeaching: 9 });
  });

  it('keeps the bio to the length the product sets', () => {
    expect(problem({ ...valid, bio: 'x'.repeat(301) })).toEqual(['bio']);
    expect(instructorProfileSchema.safeParse({ ...valid, bio: 'x'.repeat(300) }).success).toBe(true);
    // A profile without a bio is fine: it can be written later.
    expect(instructorProfileSchema.parse({ ...valid, bio: '   ' }).bio).toBe('');
  });

  it('needs a name and at least one language', () => {
    expect(problem({ ...valid, displayName: '  ' })).toEqual(['displayName']);
    expect(problem({ ...valid, languages: [] })).toEqual(['languages']);
  });

  it('takes years teaching as typed, or not at all', () => {
    expect(instructorProfileSchema.parse({ ...valid, yearsTeaching: '' }).yearsTeaching).toBeNull();
    expect(instructorProfileSchema.parse({ ...valid, yearsTeaching: '0' }).yearsTeaching).toBe(0);
    expect(problem({ ...valid, yearsTeaching: '9.5' })).toEqual(['yearsTeaching']);
    expect(problem({ ...valid, yearsTeaching: '71' })).toEqual(['yearsTeaching']);
    expect(problem({ ...valid, yearsTeaching: 'nine' })).toEqual(['yearsTeaching']);
  });

  it('only takes the specialisms and transmissions the database allows', () => {
    expect(problem({ ...valid, specialisms: ['skydiving'] })).toEqual(['specialisms.0']);
    expect(problem({ ...valid, transmission: 'hovercraft' })).toEqual(['transmission']);
    expect(instructorProfileSchema.safeParse({ ...valid, specialisms: specialisms.map((s) => s.value) }).success).toBe(
      true,
    );
  });

  it('offers the words a person would use, not the words the database stores', () => {
    expect(specialisms.map((item) => item.label)).toContain('Pass Plus');
    expect(transmissions.map((item) => item.value)).toEqual(['manual', 'automatic', 'both']);
    expect(languages[0]).toBe('English');
  });
});
