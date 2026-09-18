import 'server-only';
import { suggestInstructors, type Suggestion } from '@repo/core/allocation';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const minutes = z.number().int();

// The function answers JSON, so it is read the way any input is.
const factsSchema = z.object({
  learner: z.object({ transmission: z.enum(['manual', 'automatic']).nullable(), outcode: z.string().nullable() }),
  instructors: z.array(
    z.object({
      instructor_id: z.string(),
      name: z.string(),
      badge: z.enum(['checked', 'unchecked', 'expired']),
      transmission: z.enum(['manual', 'automatic', 'both']),
      distance_miles: z.number().nullable(),
      radius_miles: minutes,
      open_minutes: minutes,
      free_minutes: minutes,
    }),
  ),
});

export interface LearnerAllocation {
  /** Best first, with why (SCH-03). Nobody who does not teach the learner's gearbox. */
  suggestions: Suggestion[];
  /** Everybody still teaching at the school, by name, for choosing by hand. */
  everybody: { id: string; name: string }[];
}

/**
 * Who could teach a learner at a school, and who suits them best (SCH-03, LRN-06, M5-14). The
 * database gathers the facts and decides who may see them; packages/core puts them in order.
 */
export async function learnerAllocation(businessId: string, learnerId: string): Promise<LearnerAllocation> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_allocation', { p_business_id: businessId, p_learner_id: learnerId });
  if (error) throw new Error(`Could not read who could teach this learner: ${error.message}`);
  const facts = factsSchema.parse(data);

  const instructors = facts.instructors.map((one) => ({
    instructorId: one.instructor_id,
    name: one.name,
    badge: one.badge,
    transmission: one.transmission,
    distanceMiles: one.distance_miles,
    radiusMiles: one.radius_miles,
    openMinutes: one.open_minutes,
    freeMinutes: one.free_minutes,
  }));

  return {
    suggestions: suggestInstructors(facts.learner, instructors),
    everybody: instructors.map((one) => ({ id: one.instructorId, name: one.name })),
  };
}
