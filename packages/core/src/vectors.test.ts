import { describe, expect, it } from 'vitest';
import vectorFile from './availability-vectors.json' with { type: 'json' };
import { addDaysToLocalDate } from './time/calendar.ts';
import { todayInZone } from './time/zone.ts';
import { openWindows, type AvailabilityException, type TimeRange, type WorkingHour } from './availability.ts';
import { slotProblem, type SlotRules } from './slots.ts';

/**
 * The shared vectors (M2-13). The same file is turned into a pgTAP test by
 * scripts/availability-vectors.mjs, so the rules in TypeScript and the rules in SQL are
 * held to one set of answers rather than two that drift apart.
 */
interface Vector {
  name: string;
  startsAt: string;
  expect: string | null;
  hours?: WorkingHour[];
  rules?: Partial<SlotRules>;
  exceptions?: { kind: string; startsAt: string; endsAt: string }[];
  busy?: { startsAt: string; endsAt: string }[];
  now?: string;
  by?: string;
}

interface VectorFile {
  timeZone: string;
  defaults: { hours: WorkingHour[]; rules: SlotRules; now: string; by: string };
  vectors: Vector[];
}

describe('availability vectors (R-04, M2-13)', () => {
  // The file is data for two runners, so it is read the way any input is, not inferred.
  const { defaults, timeZone, vectors } = vectorFile as unknown as VectorFile;

  for (const vector of vectors) {
    it(vector.name, () => {
      const hours = vector.hours ?? defaults.hours;
      const rules: SlotRules = { ...defaults.rules, ...vector.rules };
      const now = new Date(vector.now ?? defaults.now);
      const by = (vector.by ?? defaults.by) === 'instructor' ? ('instructor' as const) : ('learner' as const);
      const startsAt = new Date(vector.startsAt);

      const exceptions: AvailabilityException[] = (vector.exceptions ?? []).map((one) => ({
        kind: one.kind === 'open' ? 'open' : 'blocked',
        startsAt: new Date(one.startsAt),
        endsAt: new Date(one.endsAt),
      }));
      const instructorBusy: TimeRange[] = (vector.busy ?? []).map((one) => ({
        startsAt: new Date(one.startsAt),
        endsAt: new Date(one.endsAt),
      }));

      // A day either side of the lesson is enough for any window it could sit in.
      const day = todayInZone(startsAt, timeZone);
      const windows = openWindows({
        hours,
        exceptions,
        from: addDaysToLocalDate(day, -1),
        to: addDaysToLocalDate(day, 1),
        timeZone,
      });

      expect(slotProblem({ startsAt, rules, windows, instructorBusy, now, by, timeZone })).toBe(vector.expect);
    });
  }
});
