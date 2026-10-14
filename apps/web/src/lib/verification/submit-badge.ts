import 'server-only';
import { parsePostgresError } from '@repo/core/errors';
import { isProfileObjectPath } from '@repo/core/images';
import { err, ok, type Result } from '@repo/core/result';
import type { OnboardingBadge } from '@repo/core/schemas/onboarding';
import { badgesBucket, removeProfileImage } from '@/lib/storage/images';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * What to say beside each field the database refused (INS-02, D-262). The database names the
 * field; without this the screen could only say "check the highlighted field" with nothing
 * highlighted, which is what the product owner saw when a photo was refused.
 */
export const badgeFieldProblems: Readonly<Record<string, string>> = {
  badgeNumber: 'Enter the number on your badge in digits, like 123456',
  badgeExpiry: 'Enter the expiry date on your badge',
  dbsConfirmed: 'Confirm your enhanced DBS check',
  badgePath: 'Add a photo of your badge',
};

/**
 * Sends a badge to be checked, from onboarding or from the profile (INS-02). It needs a photo: the
 * one chosen now, or one still on file from before. The photo it replaces is nobody's afterwards.
 */
export async function submitBadge(
  supabase: Supabase,
  profileId: string,
  values: OnboardingBadge,
  storedPath: string | null,
): Promise<Result<null>> {
  const { qualification, badgeNumber, badgeExpiry, dbsConfirmed, badgePath } = values;
  if (typeof badgePath === 'string' && !isProfileObjectPath(badgePath, profileId)) {
    return err('VALIDATION_FAILED', undefined, { badgePath: 'That photo could not be saved. Choose it again.' });
  }
  if (!badgePath && storedPath === null) {
    return err('VALIDATION_FAILED', undefined, { badgePath: badgeFieldProblems.badgePath ?? '' });
  }

  const { error } = await supabase.rpc('submit_verification', {
    p_profile_id: profileId,
    p_qualification: qualification,
    p_badge_number: badgeNumber,
    p_badge_expiry: badgeExpiry,
    p_dbs_confirmed: dbsConfirmed,
    p_badge_path: badgePath ?? undefined,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (code !== 'VALIDATION_FAILED') return err(code);
    const field = typeof context.field === 'string' ? context.field : null;
    const problem = field === null ? undefined : badgeFieldProblems[field];
    return err('VALIDATION_FAILED', undefined, field !== null && problem !== undefined ? { [field]: problem } : undefined);
  }

  if (typeof badgePath === 'string' && storedPath !== null && storedPath !== badgePath) {
    await removeProfileImage(supabase, badgesBucket, storedPath);
  }
  return ok(null);
}
