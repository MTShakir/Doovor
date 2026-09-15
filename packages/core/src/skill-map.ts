/**
 * A learner's skill map: each area of the test report, where they are with it (PRG-02, PRG-03,
 * M4-07).
 *
 * An area shows the rating from the most recent lesson it was rated in, because that is where the
 * learner is now: an average would still hold the lesson it was first introduced in against them
 * months later. How often it has been rated says how much practice sits behind that.
 */

import { skillAreas, type SkillArea, type SkillCode, type SkillRating } from './skills.ts';

export interface RatedSkill {
  skillCode: SkillCode;
  rating: SkillRating;
  /** When the lesson it was rated in started. */
  at: Date;
  /**
   * How many ratings this stands for: one rating is 1, and an area the database has already
   * rolled up to its latest rating stands for every lesson that rated it. Defaults to 1.
   */
  times?: number;
}

export interface SkillProgress {
  area: SkillArea;
  /** The latest rating, or null for an area not worked on yet. */
  rating: SkillRating | null;
  /** How many lessons rated it. */
  times: number;
  lastRatedAt: Date | null;
}

/** Every area, in the order of the test report, with where the learner is with it. */
export function skillMap(ratings: readonly RatedSkill[]): SkillProgress[] {
  const latest = new Map<SkillCode, RatedSkill>();
  const times = new Map<SkillCode, number>();
  for (const rated of ratings) {
    times.set(rated.skillCode, (times.get(rated.skillCode) ?? 0) + (rated.times ?? 1));
    const current = latest.get(rated.skillCode);
    if (current === undefined || rated.at.getTime() > current.at.getTime()) latest.set(rated.skillCode, rated);
  }
  return skillAreas.map((area) => {
    const last = latest.get(area.code);
    return { area, rating: last?.rating ?? null, times: times.get(area.code) ?? 0, lastRatedAt: last?.at ?? null };
  });
}

/** "8 of 23 areas worked on, 2 driven independently", naming only what there is some of. */
export function skillMapSummary(progress: readonly SkillProgress[]): string {
  const worked = progress.filter((one) => one.rating !== null).length;
  const independent = progress.filter((one) => one.rating === 5).length;
  const base = `${String(worked)} of ${String(progress.length)} areas worked on`;
  return independent === 0 ? base : `${base}, ${String(independent)} driven independently`;
}
