import { describe, expect, it } from 'vitest';
import { inReportOrder, isSkillCode, isSkillRating, skillArea, skillAreas, skillCodes, skillRatingLabels, skillRatings } from './skills.ts';

describe('the skill map (PRG-02, PRD Appendix A, M4-01)', () => {
  it('has the 23 areas of Appendix A, in the order of the test report', () => {
    // The same list is pinned in supabase/tests/66_skills_test.sql, against public.skills.
    expect(skillCodes).toEqual([
      'CTRL', 'COCKPIT', 'MOVEOFF', 'MIRRORS', 'SIGNALS', 'CLEAR', 'RESPONSE', 'SPEED', 'FOLLOW', 'PROGRESS', 'JUNCTIONS',
      'ROUNDABOUT', 'JUDGEMENT', 'POSITION', 'PEDX', 'STOPS', 'AWARE', 'E-STOP', 'MANOEUVRE', 'DUALCW', 'RURAL', 'INDEP', 'ECO',
    ]);
  });

  it('names each area once, and says what it covers', () => {
    expect(new Set(skillAreas.map((area) => area.name)).size).toBe(skillAreas.length);
    expect(skillArea('JUNCTIONS')).toEqual({
      code: 'JUNCTIONS',
      name: 'Junctions',
      subSkills: ['Approach speed', 'Observation', 'Turning right', 'Turning left', 'Cutting corners'],
    });
    expect(skillArea('COCKPIT').name).toBe('Cockpit checks and Show me Tell me');
    // Some areas are one thing, with nothing more to break down.
    expect(skillArea('E-STOP').subSkills).toEqual([]);
  });

  it('writes every name and sub-skill in sentence case, with no dashes', () => {
    for (const area of skillAreas) {
      for (const words of [area.name, ...area.subSkills]) {
        expect(words.charAt(0)).toBe(words.charAt(0).toUpperCase());
        expect(words).not.toMatch(/[\u2013\u2014]/);
      }
    }
  });

  it('knows a code it has from one it does not', () => {
    expect(isSkillCode('ROUNDABOUT')).toBe(true);
    expect(isSkillCode('roundabout')).toBe(false);
    expect(isSkillCode('PARKING')).toBe(false);
    expect(isSkillCode(7)).toBe(false);
  });

  it('sorts ratings the way the test report lists the areas, whatever order they were tapped in', () => {
    const tapped = [
      { skillCode: 'ROUNDABOUT', rating: 2 },
      { skillCode: 'CTRL', rating: 4 },
      { skillCode: 'MIRRORS', rating: 3 },
    ] as const;
    expect(inReportOrder(tapped).map((one) => one.skillCode)).toEqual(['CTRL', 'MIRRORS', 'ROUNDABOUT']);
    // The list it was given is left as it was.
    expect(tapped[0].skillCode).toBe('ROUNDABOUT');
  });
});

describe('the rating scale (PRG-02, M4-01)', () => {
  it('runs from introduced to independent', () => {
    expect(skillRatings.map((rating) => `${String(rating)} ${skillRatingLabels[rating]}`)).toEqual([
      '1 Introduced',
      '2 Under full instruction',
      '3 Prompted',
      '4 Seldom prompted',
      '5 Independent',
    ]);
  });

  it('takes whole numbers from 1 to 5 and nothing else', () => {
    expect(isSkillRating(1)).toBe(true);
    expect(isSkillRating(5)).toBe(true);
    expect(isSkillRating(0)).toBe(false);
    expect(isSkillRating(6)).toBe(false);
    expect(isSkillRating(2.5)).toBe(false);
    expect(isSkillRating('3')).toBe(false);
  });
});
