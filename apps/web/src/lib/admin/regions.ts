import 'server-only';
import { postcodeAreaLabel, readiness, wholeHours, type SwitchOnRule } from '@repo/core/regions';
import { formatDateWithYear } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const count = z.number().int();

// The function answers JSON, so it is read the way any input is.
const regionsSchema = z.object({
  rule: z.object({ instructors: count, hours: count }),
  regions: z.array(
    z.object({
      area: z.string(),
      instructors: count,
      free_minutes: count,
      waiting: count,
      requests: count,
      open: z.boolean(),
      switched_at: z.string().nullable(),
    }),
  ),
});

export interface AdminRegion {
  /** "LS" */
  area: string;
  /** "LS, Leeds" */
  label: string;
  instructors: number;
  /** Free hours in the next 14 days, rounded down. */
  freeHours: number;
  waiting: number;
  requests: number;
  open: boolean;
  /** "Tue 15 Sep 2026": when it last opened or closed, or null for an area never switched. */
  switchedOn: string | null;
  meetsRule: boolean;
  instructorsShort: number;
  hoursShort: number;
}

export interface AdminRegions {
  rule: SwitchOnRule;
  regions: AdminRegion[];
}

/** Ready to open first, then open, then the rest by how many instructors and learners there are. */
function order(a: AdminRegion, b: AdminRegion): number {
  const rank = (region: AdminRegion) => (region.meetsRule && !region.open ? 0 : region.open ? 1 : 2);
  return rank(a) - rank(b) || b.instructors - a.instructors || b.waiting - a.waiting || a.area.localeCompare(b.area);
}

/**
 * Supply and demand in each postcode area against the switch-on rule (ADM-04, PRD 4.2, M5-19). The
 * database counts both; this names the areas and says how far each is from opening.
 */
export async function adminRegions(): Promise<AdminRegions> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_regions');
  if (error) throw new Error(`Could not read the regions: ${error.message}`);
  const facts = regionsSchema.parse(data);

  return {
    rule: facts.rule,
    regions: facts.regions
      .map((one) => {
        const ready = readiness({ instructors: one.instructors, freeMinutes: one.free_minutes }, facts.rule);
        return {
          area: one.area,
          label: postcodeAreaLabel(one.area),
          instructors: one.instructors,
          freeHours: wholeHours(one.free_minutes),
          waiting: one.waiting,
          requests: one.requests,
          open: one.open,
          switchedOn: one.switched_at === null ? null : formatDateWithYear(new Date(one.switched_at)),
          ...ready,
        };
      })
      .sort(order),
  };
}
