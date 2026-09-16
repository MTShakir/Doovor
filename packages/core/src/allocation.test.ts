import { describe, expect, it } from 'vitest';
import { suggestInstructors, teachesGearbox, type AllocationInstructor, type AllocationLearner } from './allocation.ts';

const learner: AllocationLearner = { transmission: 'automatic', outcode: 'M14' };

function instructor(overrides: Partial<AllocationInstructor> & Pick<AllocationInstructor, 'name'>): AllocationInstructor {
  return {
    instructorId: overrides.name.toLowerCase(),
    badge: 'checked',
    transmission: 'both',
    distanceMiles: 2,
    radiusMiles: 8,
    openMinutes: 2400,
    freeMinutes: 1200,
    ...overrides,
  };
}

describe('suggesting an instructor (SCH-03, M5-14)', () => {
  it('never suggests somebody who does not teach the learner gearbox', () => {
    expect(teachesGearbox('manual', 'automatic')).toBe(false);
    expect(teachesGearbox('both', 'automatic')).toBe(true);
    expect(teachesGearbox('manual', null)).toBe(true);
    const names = suggestInstructors(learner, [instructor({ name: 'Manual Only', transmission: 'manual' }), instructor({ name: 'Auto' })]).map((one) => one.name);
    expect(names).toEqual(['Auto']);
  });

  it('puts those covering the area first, then those with time, the most time, the nearest, and then by name', () => {
    const ranked = suggestInstructors(learner, [
      instructor({ name: 'Far Away', distanceMiles: 12, freeMinutes: 3000 }),
      instructor({ name: 'Fully Booked', distanceMiles: 1, freeMinutes: 30 }),
      instructor({ name: 'No Base', distanceMiles: null, freeMinutes: 2000 }),
      instructor({ name: 'Busy Near', distanceMiles: 1, freeMinutes: 300 }),
      instructor({ name: 'Free Near', distanceMiles: 3, freeMinutes: 900 }),
      instructor({ name: 'Also Free Near', distanceMiles: 3, freeMinutes: 900 }),
      instructor({ name: 'Nearer Same Time', distanceMiles: 2, freeMinutes: 900 }),
    ]);
    expect(ranked.map((one) => one.name)).toEqual([
      'Nearer Same Time',
      'Also Free Near',
      'Free Near',
      'Busy Near',
      'Fully Booked',
      'No Base',
      'Far Away',
    ]);
    expect(ranked.map((one) => one.area)).toEqual(['covers', 'covers', 'covers', 'covers', 'covers', 'unknown', 'outside']);
  });

  it('gives its reasons, the area first', () => {
    const [near, booked, far, noHours] = suggestInstructors(learner, [
      instructor({ name: 'Emma', transmission: 'automatic', distanceMiles: 2.14, freeMinutes: 750 }),
      instructor({ name: 'Tom', distanceMiles: 1, freeMinutes: 45 }),
      instructor({ name: 'Zed', distanceMiles: 11.96, radiusMiles: 10, freeMinutes: 60 }),
      instructor({ name: 'Zoe', distanceMiles: 20, openMinutes: 0, freeMinutes: 0 }),
    ]);
    expect(near?.reasons).toEqual(['Covers M14, 2.1 miles away', '12 free hours in the next 2 weeks', 'Teaches automatic']);
    expect(booked?.reasons).toEqual(['Covers M14, 1 mile away', 'Fully booked for the next 2 weeks', 'Teaches manual and automatic']);
    expect(far?.reasons).toEqual(['12 miles away, beyond the 10 miles they travel', '1 free hour in the next 2 weeks', 'Teaches manual and automatic']);
    expect(noHours?.reasons[1]).toBe('No working hours in the next 2 weeks');
    const [sameStreet] = suggestInstructors(learner, [instructor({ name: 'Nia', distanceMiles: 0.03 })]);
    expect(sameStreet?.reasons[0]).toBe('Covers M14, under 0.1 miles away');
  });

  it('puts instructors whose badge is checked and in date before anybody else, and says why the others are lower', () => {
    const ranked = suggestInstructors(learner, [
      instructor({ name: 'Trainee Near', badge: 'unchecked', distanceMiles: 1, freeMinutes: 3000 }),
      instructor({ name: 'Lapsed Near', badge: 'expired', distanceMiles: 1, freeMinutes: 3000 }),
      instructor({ name: 'Checked Far', distanceMiles: 20, freeMinutes: 60 }),
    ]);
    expect(ranked.map((one) => one.name)).toEqual(['Checked Far', 'Lapsed Near', 'Trainee Near']);
    expect(ranked[1]?.reasons[0]).toBe('Badge out of date');
    expect(ranked[2]?.reasons[0]).toBe('Badge not checked yet');
    expect(ranked[0]?.reasons).toHaveLength(3);
  });

  it('says what it does not know rather than guessing', () => {
    const [noBase] = suggestInstructors(learner, [instructor({ name: 'Nia', distanceMiles: null })]);
    expect(noBase?.reasons[0]).toBe('No base postcode set yet');
    const [noPostcode] = suggestInstructors({ transmission: null, outcode: null }, [instructor({ name: 'Nia', distanceMiles: null })]);
    expect(noPostcode?.reasons[0]).toBe('The learner has no postcode yet');
  });
});
