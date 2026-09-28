'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const checkSchema = z.object({ photoId: z.uuid(), verified: z.boolean() });

/**
 * D-218: staff tick a pass photo they have checked, or take the tick back. The database decides
 * who may and writes the audit row.
 */
export async function checkGalleryPhoto(input: unknown): Promise<Result<{ verified: boolean }>> {
  const parsed = checkSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_check_gallery_photo', {
    p_photo_id: parsed.data.photoId,
    p_verified: parsed.data.verified,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'NOT_FOUND') return err(code, 'That photo is no longer there.');
    if (code === 'NOT_ALLOWED') return err(code, 'Only platform staff can do that.');
    return err(code);
  }

  revalidatePath('/admin/gallery');
  return ok({ verified: parsed.data.verified });
}

const hideSchema = z.object({ photoId: z.uuid(), hidden: z.boolean() });

/**
 * D-218: taking one off the public page, or putting it back. Taking one down takes the tick with
 * it, which the database does rather than this.
 */
export async function hideGalleryPhoto(input: unknown): Promise<Result<{ hidden: boolean }>> {
  const parsed = hideSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_hide_gallery_photo', {
    p_photo_id: parsed.data.photoId,
    p_hidden: parsed.data.hidden,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'NOT_FOUND') return err(code, 'That photo is no longer there.');
    if (code === 'NOT_ALLOWED') return err(code, 'Only platform staff can do that.');
    return err(code);
  }

  revalidatePath('/admin/gallery');
  return ok({ hidden: parsed.data.hidden });
}
