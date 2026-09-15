import { describe, expect, it } from 'vitest';
import { skillMap, skillMapSummary, type RatedSkill } from './skill-map.ts';

const on = (day: number) => new Date(Date.UTC(2026, 8, day, 9));

describe('a learner skill map (PRG-03, M4-07)', () => {
  const ratings: RatedSkill[] = [
    { skillCode: 'JUNCTIONS', rating: 2, at: on(1) },
    { skillCode: 'JUNCTIONS', rating: 4, at: on(8) },
    // Sent late from a phone with no signal: an older lesson arriving after a newer one.
    { skillCode: 'JUNCTIONS', rating: 3, at: on(5) },
    { skillCode: 'ROUNDABOUT', rating: 5, at: on(8) },
  ];

  it('has every area of the test report, in its order, worked on or not', () => {
    const map = skillMap(ratings);
    expect(map).toHaveLength(23);
    expect(map[0]?.area.code).toBe('CTRL');
    expect(map[0]).toMatchObject({ rating: null, times: 0, lastRatedAt: null });
  });

  it('shows where the learner is now: the rating from the latest lesson, whatever order they arrived in', () => {
    const junctions = skillMap(ratings).find((one) => one.area.code === 'JUNCTIONS');
    expect(junctions).toMatchObject({ rating: 4, times: 3, lastRatedAt: on(8) });
  });

  it('takes areas the database has already rolled up to their latest rating, counting every lesson behind each', () => {
    const map = skillMap([
      { skillCode: 'JUNCTIONS', rating: 4, at: on(8), times: 3 },
      { skillCode: 'ECO', rating: 1, at: on(2), times: 1 },
    ]);
    expect(map.find((one) => one.area.code === 'JUNCTIONS')).toMatchObject({ rating: 4, times: 3, lastRatedAt: on(8) });
    expect(map.filter((one) => one.rating !== null).map((one) => one.area.code)).toEqual(['JUNCTIONS', 'ECO']);
  });

  it('sums the map up in a line', () => {
    expect(skillMapSummary(skillMap(ratings))).toBe('2 of 23 areas worked on, 1 driven independently');
    expect(skillMapSummary(skillMap([]))).toBe('0 of 23 areas worked on');
    // Nothing driven independently yet is left unsaid, rather than counted as none.
    expect(skillMapSummary(skillMap([{ skillCode: 'CTRL', rating: 3, at: on(1) }]))).toBe('1 of 23 areas worked on');
  });
});
