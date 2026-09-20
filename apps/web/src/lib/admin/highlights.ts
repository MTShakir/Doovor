import 'server-only';
import { periodInstants } from '@repo/core/money-periods';
import type { StatsRange } from '@repo/core/stats-range';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const whole = z.number().int();

const earningRow = z.object({ id: z.uuid(), name: z.string(), pence: whole, payments: whole });
const busyRow = z.object({ id: z.uuid(), name: z.string(), learners: whole, lessons: whole });
const arrivalRow = z.object({ id: z.uuid(), name: z.string(), type: z.enum(['independent', 'school']), joined_at: z.string() });

// The function answers JSON, so it is read the way any input is.
const highlightsSchema = z.object({
  earning_schools: z.array(earningRow),
  earning_instructors: z.array(earningRow),
  busiest_schools: z.array(busyRow),
  busiest_instructors: z.array(busyRow),
  joined: z.array(arrivalRow),
  more: z.boolean(),
});

export interface EarningRow {
  id: string;
  name: string;
  pence: number;
  payments: number;
}

export interface BusyRow {
  id: string;
  name: string;
  learners: number;
  lessons: number;
}

export interface ArrivalRow {
  id: string;
  name: string;
  kind: 'independent' | 'school';
  joinedAt: string;
}

export interface PlatformHighlights {
  earningSchools: EarningRow[];
  earningInstructors: EarningRow[];
  busiestSchools: BusyRow[];
  busiestInstructors: BusyRow[];
  arrivals: ArrivalRow[];
  /** More joined in these days than are shown. */
  more: boolean;
}

/** How many more arrivals "Show more" adds under the dashboard (D-172). */
export const arrivalsStep = 5;
const most = 50;

/** How many arrivals to show, from the address: five to begin with, in fives, and no more than fifty. */
export function arrivalsCount(value: string | undefined): number {
  const asked = Number(value);
  if (!Number.isInteger(asked) || asked < arrivalsStep || asked % arrivalsStep !== 0) return arrivalsStep;
  return Math.min(asked, most);
}

/**
 * The five lists under the dashboard's figures (ADM-01, D-172): who took the most, who is teaching
 * the most learners, and who joined, over the same days as the figures. The database works them
 * out and refuses anybody who is not platform staff past their second step.
 */
export async function platformHighlights(range: StatsRange, joined: number): Promise<PlatformHighlights> {
  const { from, to } = periodInstants(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('platform_highlights', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_joined: joined,
  });
  if (error) throw new Error(`Could not read the platform lists: ${error.message}`);
  const lists = highlightsSchema.parse(data);

  return {
    earningSchools: lists.earning_schools,
    earningInstructors: lists.earning_instructors,
    busiestSchools: lists.busiest_schools,
    busiestInstructors: lists.busiest_instructors,
    arrivals: lists.joined.map((row) => ({ id: row.id, name: row.name, kind: row.type, joinedAt: row.joined_at })),
    more: lists.more,
  };
}
