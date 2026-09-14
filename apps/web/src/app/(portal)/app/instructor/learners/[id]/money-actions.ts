'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const packageSaleSchema = z.object({
  learnerId: z.uuid(),
  packageId: z.uuid(),
  method: z.enum(['cash', 'bank']),
});

/**
 * PAY-04, PAY-05, M3-16: a package the learner paid for in person. The function decides who may
 * record one and writes the payment and the credit it buys together. Returns the lot of credit.
 */
export async function recordOfflinePackage(input: unknown): Promise<Result<{ lotId: string }>> {
  const parsed = packageSaleSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('record_offline_package', {
    p_learner_id: parsed.data.learnerId,
    p_package_id: parsed.data.packageId,
    p_method: parsed.data.method,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok({ lotId: data });
}
