import { describe, expect, it } from 'vitest';
import { ageBand, ageOn, isAtLeast, leastLearnerAge } from './age.ts';

describe('age (AUTH-06, R-16, M2-01)', () => {
  it('counts whole years', () => {
    expect(ageOn('2008-09-12', '2026-09-12')).toBe(18);
    expect(ageOn('2008-09-13', '2026-09-12')).toBe(17);
    expect(ageOn('2008-09-11', '2026-09-12')).toBe(18);
  });

  it('changes on the birthday itself, not the day after', () => {
    expect(isAtLeast('2010-09-12', 16, '2026-09-11')).toBe(false);
    expect(isAtLeast('2010-09-12', 16, '2026-09-12')).toBe(true);
  });

  it('handles someone born on 29 February', () => {
    // No 29th in 2026, so the law treats the 1st of March as the birthday.
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('tells an instructor the band and nothing else (R-16)', () => {
    expect(ageBand('2010-01-01', '2026-09-12')).toBe('under_18');
    expect(ageBand('2008-01-01', '2026-09-12')).toBe('18_plus');
    // On the eighteenth birthday they are in the older band.
    expect(ageBand('2008-09-12', '2026-09-12')).toBe('18_plus');
  });

  it('knows the youngest a learner can be', () => {
    expect(leastLearnerAge).toBe(16);
    expect(isAtLeast('2010-09-13', leastLearnerAge, '2026-09-12')).toBe(false);
  });
});
