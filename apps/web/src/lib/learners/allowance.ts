import 'server-only';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  on_books: z.number().int(),
  limit: z.number().int().nullable(),
});

export interface LearnerAllowance {
  /** Learners being taught, waiting or with a test booked. */
  onBooks: number;
  /** How many the plan carries, or null where there is no limit at all. */
  limit: number | null;
}

/**
 * How many learners a Business is carrying and how many it may (D-208). The database decides who
 * may ask; a member of the Business may, because it is their own number.
 */
export async function learnerAllowance(businessId: string): Promise<LearnerAllowance | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('learner_allowance', { p_business_id: businessId });
  if (error) return null;

  const parsed = schema.safeParse(data);
  if (!parsed.success) return null;
  return { onBooks: parsed.data.on_books, limit: parsed.data.limit };
}
