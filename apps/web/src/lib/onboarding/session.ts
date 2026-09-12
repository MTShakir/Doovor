import 'server-only';
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
    .select('display_name')
    .eq('id', membership.instructorProfileId)
    .single();

  return {
    profileId: membership.instructorProfileId,
    businessId: membership.businessId,
    step: membership.onboarding.step,
    completed: membership.onboarding.completed,
    displayName: profile?.display_name ?? '',
  };
}
