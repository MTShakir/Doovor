'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const linkIdSchema = z.uuid();

/**
 * D-282: the instructor leaves the school their business is linked to. The database checks it is
 * theirs to leave; the public pages are read fresh, as the profile no longer names the school.
 */
export async function leaveSchool(linkId: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = linkIdSchema.safeParse(linkId);
  if (!parsed.success) return err('NOT_FOUND', 'That school could not be found.');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('end_school_link', { p_link_id: parsed.data });
  if (error) return err(parsePostgresError(error).code);
  expireAllInstructorProfiles();
  return ok(null);
}
