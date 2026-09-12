import 'server-only';
import { defaultRadiusMiles } from '@repo/core/schemas/onboarding';
import type { AccessMembership } from '@repo/db';
import { getAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirectTo } from '@/lib/redirect-to';
import { landingPath } from '@/lib/auth/portals';

export interface OnboardingSession {
  profileId: string;
  businessId: string;
  step: number;
  completed: boolean;
  /** What they are called today: the name step starts from this. */
  displayName: string;
  /** The photo they have already, as an object path in the avatars bucket. */
  photoPath: string | null;
  /** Their badge photo, as an object path in the private badges bucket. */
  badgePath: string | null;
  qualification: 'adi' | 'pdi';
  badgeNumber: string | null;
  badgeExpiry: string | null;
  basePostcode: string | null;
  radiusMiles: number;
}

function instructorMembership(memberships: AccessMembership[]): AccessMembership | null {
  return memberships.find((membership) => membership.instructorProfileId !== null) ?? null;
}

/**
 * Onboarding is for instructors (AUTH-04). Anyone else goes to their own portal, and an
 * instructor who has finished goes to their diary.
 */
export async function requireOnboarding(): Promise<OnboardingSession> {
  const result = await getAccess();
  if (!result) redirectTo('/sign-in?next=%2Fonboarding');
  const membership = instructorMembership(result.access.memberships);
  if (!membership?.instructorProfileId || !membership.onboarding) redirectTo(landingPath(result.access));
  if (membership.onboarding.completed) redirectTo('/app/instructor');

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from('instructor_profiles')
    .select('display_name, photo_path, badge_path, qualification, badge_number, badge_expiry, base_postcode, radius_miles')
    .eq('id', membership.instructorProfileId)
    .single();

  return {
    profileId: membership.instructorProfileId,
    businessId: membership.businessId,
    step: membership.onboarding.step,
    completed: membership.onboarding.completed,
    displayName: profile?.display_name ?? '',
    photoPath: profile?.photo_path ?? null,
    badgePath: profile?.badge_path ?? null,
    qualification: profile?.qualification ?? 'adi',
    badgeNumber: profile?.badge_number ?? null,
    badgeExpiry: profile?.badge_expiry ?? null,
    basePostcode: profile?.base_postcode ?? null,
    radiusMiles: profile?.radius_miles ?? defaultRadiusMiles,
  };
}
