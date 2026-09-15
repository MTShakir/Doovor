/**
 * The skill map a lesson record is written against (PRG-02, PRD Appendix A, M4-01).
 *
 * The areas follow the DVSA driving test report, in its order, so a learner's progress reads the
 * way their test will be marked. A lesson record rates areas; the sub-skills say what an area
 * covers. The database keeps the same codes in `public.skills`, seeded by migration, and a test on
 * each side pins the list to Appendix A so the two cannot drift apart.
 */

export interface SkillArea {
  /** A short code that never changes, stored with every rating. */
  code: string;
  name: string;
  /** What the area covers. Ratings are for the area as a whole. */
  subSkills: readonly string[];
}

export const skillAreas = [
  { code: 'CTRL', name: 'Controls', subSkills: ['Accelerator', 'Clutch', 'Gears', 'Footbrake', 'Parking brake', 'Steering', 'Ancillary controls'] },
  { code: 'COCKPIT', name: 'Cockpit checks and Show me Tell me', subSkills: ['Seat', 'Mirrors', 'Doors', 'Seatbelt', 'Vehicle safety questions'] },
  { code: 'MOVEOFF', name: 'Moving off', subSkills: ['Safely', 'Under control', 'On a hill', 'At an angle'] },
  { code: 'MIRRORS', name: 'Use of mirrors', subSkills: ['Signalling', 'Change direction', 'Change speed'] },
  { code: 'SIGNALS', name: 'Signals', subSkills: ['Necessary', 'Correctly', 'Timed'] },
  { code: 'CLEAR', name: 'Clearance to obstructions', subSkills: [] },
  {
    code: 'RESPONSE',
    name: 'Response to signs and signals',
    subSkills: ['Traffic signs', 'Road markings', 'Traffic lights', 'Traffic controllers', 'Other road users'],
  },
  { code: 'SPEED', name: 'Use of speed', subSkills: [] },
  { code: 'FOLLOW', name: 'Following distance', subSkills: [] },
  { code: 'PROGRESS', name: 'Progress', subSkills: ['Appropriate speed', 'Undue hesitation'] },
  { code: 'JUNCTIONS', name: 'Junctions', subSkills: ['Approach speed', 'Observation', 'Turning right', 'Turning left', 'Cutting corners'] },
  { code: 'ROUNDABOUT', name: 'Roundabouts', subSkills: ['Approach', 'Lane choice', 'Signals', 'Exit'] },
  { code: 'JUDGEMENT', name: 'Judgement', subSkills: ['Overtaking', 'Meeting', 'Crossing'] },
  { code: 'POSITION', name: 'Positioning', subSkills: ['Normal driving', 'Lane discipline'] },
  { code: 'PEDX', name: 'Pedestrian crossings', subSkills: [] },
  { code: 'STOPS', name: 'Position for normal stops', subSkills: [] },
  { code: 'AWARE', name: 'Awareness and planning', subSkills: ['Hazard perception', 'Anticipation'] },
  { code: 'E-STOP', name: 'Emergency stop', subSkills: [] },
  {
    code: 'MANOEUVRE',
    name: 'Manoeuvres',
    subSkills: ['Parallel park', 'Bay park forward', 'Bay park reverse', 'Pull up on right and reverse'],
  },
  { code: 'DUALCW', name: 'Dual carriageways and fast roads', subSkills: ['Joining', 'Lane changes', 'Leaving'] },
  { code: 'RURAL', name: 'Rural roads', subSkills: ['Bends', 'Narrow roads', 'Passing places'] },
  { code: 'INDEP', name: 'Independent driving', subSkills: ['Following sat nav', 'Following signs'] },
  { code: 'ECO', name: 'Eco-safe driving', subSkills: ['Planning', 'Control'] },
] as const satisfies readonly SkillArea[];

export type SkillCode = (typeof skillAreas)[number]['code'];

/** The codes, in the order of the test report. */
export const skillCodes: readonly SkillCode[] = skillAreas.map((area) => area.code);

export function isSkillCode(value: unknown): value is SkillCode {
  return typeof value === 'string' && (skillCodes as readonly string[]).includes(value);
}

/** One area, found by its code. */
export function skillArea(code: SkillCode): SkillArea {
  const found = skillAreas.find((area) => area.code === code);
  // Every SkillCode comes from skillAreas, so there is always one to find.
  if (found === undefined) throw new RangeError(`No skill area ${code}`);
  return found;
}

/** Things about skill areas, sorted the way the test report lists the areas. */
export function inReportOrder<T extends { skillCode: SkillCode }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => skillCodes.indexOf(a.skillCode) - skillCodes.indexOf(b.skillCode));
}

/**
 * The rating scale (PRG-02): how much help the learner needed with an area on the day, from the
 * first time it was introduced to driving it on their own.
 */
export const skillRatings = [1, 2, 3, 4, 5] as const;

export type SkillRating = (typeof skillRatings)[number];

export const skillRatingLabels: Record<SkillRating, string> = {
  1: 'Introduced',
  2: 'Under full instruction',
  3: 'Prompted',
  4: 'Seldom prompted',
  5: 'Independent',
};

export function isSkillRating(value: unknown): value is SkillRating {
  return typeof value === 'number' && (skillRatings as readonly number[]).includes(value);
}
