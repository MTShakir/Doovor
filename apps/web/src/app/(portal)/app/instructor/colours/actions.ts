'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { brandColourInputSchema, contrastMessage } from '@repo/core/schemas/brand-colour';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * D-210: the owner picks the colour their booking page is drawn in, or clears it.
 *
 * The database checks the contrast as well. This is not belt and braces for its own sake: the
 * rule is what keeps a learner able to read the page, so it holds wherever the call comes from.
 */
export async function setBookingColour(input: unknown): Promise<Result<{ colour: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;

  const parsed = brandColourInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('set_brand_colour', {
    p_business_id: parsed.data.businessId,
    p_colour: parsed.data.colour,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (code === 'PLAN_REQUIRED') return err(code, 'Your own colours are part of Pro.');
    if (code === 'VALIDATION_FAILED' && context.reason === 'contrast') {
      return err(code, contrastMessage, { colour: contrastMessage });
    }
    return err(code);
  }

  revalidatePath('/app/instructor/colours');
  return ok({ colour: typeof data === 'string' ? data : '' });
}
