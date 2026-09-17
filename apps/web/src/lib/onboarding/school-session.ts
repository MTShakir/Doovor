import 'server-only';
import type { AccessMembership } from '@repo/db';
import { landingPath, requiresMfa } from '@/lib/auth/portals';
import { getAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SchoolSetupSession {
  businessId: string;
  slug: string;
  name: string;
  /** The logo it has already, as an object path in the avatars bucket. */
  logoPath: string | null;
  basePostcode: string | null;
  expectedInstructors: number | null;
}

function schoolToSetUp(memberships: AccessMembership[]): AccessMembership | null {
  return (
    memberships.find(
      (membership) =>
        membership.businessType === 'school' &&
        (membership.role === 'owner' || membership.role === 'manager') &&
        !membership.businessOnboarded,
    ) ?? null
  );
}

/**
 * Setting up a school is for its owner, or a manager, before the school's portal opens (AUTH-05).
 * They turn on two-step verification first, as the portal would ask (AUTH-08). Anybody else, and
 * a school already set up, goes where they would land.
 */
export async function requireSchoolSetup(path: string): Promise<SchoolSetupSession> {
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(path)}`);
  if (requiresMfa(result.access) && result.session.aal !== 'aal2') redirectTo(`/mfa?next=${encodeURIComponent(path)}`);
  const membership = schoolToSetUp(result.access.memberships);
  if (!membership) redirectTo(landingPath(result.access));

  const supabase = await createSupabaseServerClient();
  const { data: school, error } = await supabase
    .from('businesses')
    .select('slug, name, logo_url, base_postcode, expected_instructors')
    .eq('id', membership.businessId)
    .single();
  if (error) throw new Error(`Could not read the school being set up: ${error.message}`);

  return {
    businessId: membership.businessId,
    slug: school.slug,
    name: school.name,
    logoPath: school.logo_url,
    basePostcode: school.base_postcode,
    expectedInstructors: school.expected_instructors,
  };
}
