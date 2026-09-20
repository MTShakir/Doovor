import 'server-only';
import { formatDateWithYear, formatTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const rowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  full_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  intended_role: z.string().nullable(),
  business_name: z.string().nullable(),
  reason: z.string().nullable(),
  status: z.string(),
  requested_at: z.string(),
  erases_at: z.string(),
  processed_at: z.string().nullable(),
});

export interface DeletionRequest {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** What they said they were when they signed up: a learner, an instructor, a school. */
  role: string | null;
  business: string | null;
  /** Why they are going, in their own words, when they said. */
  reason: string | null;
  status: string;
  /** "Thu 17 Sep 2026, 11:13", in London. */
  asked: string;
  /** The day the account is erased if nobody acts: "Thu 24 Sep 2026". */
  erases: string;
  /** Days left before it is erased, counted from now; negative once it is due. */
  daysLeft: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Who has asked to leave (AUTH-09, D-175): why, how to reach them, and how long staff have before
 * the account is erased. The database decides who may read it.
 */
export async function deletionRequests(settled = false, now = new Date()): Promise<DeletionRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_deletion_requests', { p_settled: settled });
  if (error) throw new Error(`Could not read who has asked to leave: ${error.message}`);

  return z
    .array(rowSchema)
    .parse(data)
    .map((row) => {
      const asked = new Date(row.requested_at);
      const erases = new Date(row.erases_at);
      return {
        id: row.id,
        userId: row.user_id,
        name: row.full_name,
        email: row.email,
        phone: row.phone,
        role: row.intended_role,
        business: row.business_name,
        reason: row.reason,
        status: row.status,
        asked: `${formatDateWithYear(asked)}, ${formatTime(asked)}`,
        erases: formatDateWithYear(erases),
        daysLeft: Math.ceil((erases.getTime() - now.getTime()) / DAY_MS),
      };
    });
}
