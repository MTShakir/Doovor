import 'server-only';
import { busyOnDay, minutesTaken, type BusyStretch } from '@repo/core/diary';
import { formatTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The function answers JSON, so it is read the way any input is.
const linkedSchema = z.array(
  z.object({
    instructorId: z.string(),
    name: z.string(),
    businessName: z.string(),
    transmission: z.enum(['manual', 'automatic', 'both']),
    busy: z.array(z.object({ startsAt: z.string(), endsAt: z.string(), kind: z.enum(['lesson', 'away']) })),
  }),
);

/** An instructor linked to the school, and when they are busy. Nothing else of their diary. */
export interface LinkedDiary {
  instructorId: string;
  name: string;
  businessName: string;
  transmission: 'manual' | 'automatic' | 'both';
  /** A lesson of their own, or time off (D-284). */
  busy: BusyStretch[];
}

/**
 * When the instructors linked to a school are busy between two instants (M9-08, D-284). Their
 * lessons, learners and money stay theirs: the database answers the times and nothing more, and
 * only to the school's owner and managers.
 */
export async function linkedBusyBetween(schoolId: string, startsAt: Date, endsAt: Date): Promise<LinkedDiary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('school_linked_busy', {
    p_school_id: schoolId,
    p_from: startsAt.toISOString(),
    p_to: endsAt.toISOString(),
  });
  if (error) return [];
  const parsed = linkedSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((one) => ({
    ...one,
    busy: one.busy.map((time) => ({ kind: time.kind, startsAt: new Date(time.startsAt), endsAt: new Date(time.endsAt) })),
  }));
}

/**
 * One linked instructor's day as the diary shows it, worked out here: a client component may not
 * read dates while prerendering.
 */
export interface LinkedDay {
  instructorId: string;
  name: string;
  businessName: string;
  /** What fills the whole day, when something does. */
  allDay: BusyStretch['kind'] | null;
  busyMinutes: number;
  parts: { key: string; kind: BusyStretch['kind']; allDay: boolean; from: string; to: string }[];
}

/** A linked instructor's busy times cut to the day shown, with the times written out. */
export function linkedDay(linked: LinkedDiary, day: { startsAt: Date; endsAt: Date }): LinkedDay {
  const parts = busyOnDay(linked.busy, day);
  return {
    instructorId: linked.instructorId,
    name: linked.name,
    businessName: linked.businessName,
    allDay: parts.find((part) => part.allDay)?.kind ?? null,
    busyMinutes: minutesTaken(parts),
    parts: parts.map((part) => ({
      key: `${part.kind}-${part.startsAt.toISOString()}`,
      kind: part.kind,
      allDay: part.allDay,
      from: formatTime(part.startsAt),
      to: formatTime(part.endsAt),
    })),
  };
}
