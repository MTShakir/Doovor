'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { galleryPhotoSchema } from '@repo/core/schemas/gallery';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { fieldErrors } from '@/lib/forms';
import { galleryBucket, removeProfileImage } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A pass photo goes up (D-218).
 *
 * The picture is already in storage by the time this runs: the browser prepared it, which is what
 * strips the camera's position out of it, and uploaded it into the Business folder, which storage
 * checks. This records what the banner says about it, and the database checks the path, the
 * learner and the plan again.
 */
export async function addGalleryPhoto(input: unknown): Promise<Result<{ photoId: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;

  const parsed = galleryPhotoSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('add_gallery_photo', {
    p_image_path: parsed.data.imagePath,
    p_passed_on: parsed.data.passedOn,
    ...(parsed.data.learnerId === null ? {} : { p_learner_id: parsed.data.learnerId }),
    ...(parsed.data.learnerName === '' ? {} : { p_learner_name: parsed.data.learnerName }),
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'PLAN_REQUIRED') return err(code, 'The gallery is part of Pro.');
    return err(code);
  }

  revalidatePath('/app/instructor/gallery');
  return ok({ photoId: data });
}

const photoSchema = z.object({ photoId: z.uuid() });

/** Taking one down again (D-218). The picture goes with the row, since nothing else points at it. */
export async function removeGalleryPhoto(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;

  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('remove_gallery_photo', { p_photo_id: parsed.data.photoId });
  if (error) return err(parsePostgresError(error).code);

  // The row named the object; storage lets the Business delete its own folder. A picture left
  // behind is bytes nobody pays attention to, so a failure here is not worth a message.
  await removeProfileImage(supabase, galleryBucket, data);

  revalidatePath('/app/instructor/gallery');
  return ok(null);
}
