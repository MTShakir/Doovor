import 'server-only';
import { formatDate } from '@repo/core/time';
import { z } from '@repo/core/zod';
import type { AccessMembership } from '@repo/db';
import { requireSignedIn } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const linkSchema = z.object({
  linkId: z.string(),
  schoolName: z.string(),
  schoolSlug: z.string(),
  linkedAt: z.string(),
  proGiven: z.boolean(),
});

/** The school an instructor's own Business is linked to (D-282). */
export interface SchoolLink {
  linkId: string;
  schoolName: string;
  schoolSlug: string;
  /** "Tue 20 Oct", worked out here: a client component may not read dates while prerendering. */
  linkedOn: string;
  /** Pro came with the link, so it goes when the link does (D-279). */
  proGiven: boolean;
}

/**
 * The school a Business is linked to, for its owner, or null when it is not linked to one. The
 * database decides who may ask.
 */
export async function schoolLinkOf(businessId: string): Promise<SchoolLink | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('school_link_of', { p_business_id: businessId });
  if (error || data === null) return null;
  const parsed = linkSchema.safeParse(data);
  if (!parsed.success) return null;
  const { linkId, schoolName, schoolSlug, linkedAt, proGiven } = parsed.data;
  return { linkId, schoolName, schoolSlug, linkedOn: formatDate(new Date(linkedAt)), proGiven };
}

/** The Business an account runs on its own, which is what can be linked to a school. */
export function ownBusiness(memberships: AccessMembership[]): AccessMembership | null {
  return memberships.find((one) => one.businessType === 'independent' && one.role === 'owner') ?? null;
}

/**
 * The school that vouches for an instructor's badge, by name, or null where the platform checks it
 * (D-280): the school they teach under, or the one their own Business is linked to.
 */
export async function vouchingSchool(membership: AccessMembership): Promise<string | null> {
  if (membership.businessType === 'school') return membership.businessName;
  if (membership.role !== 'owner') return null;
  return (await schoolLinkOf(membership.businessId))?.schoolName ?? null;
}

/** The school the signed-in instructor's own Business is linked to, with that Business, or null. */
export async function ownSchoolLink(): Promise<{ businessId: string; businessName: string; link: SchoolLink } | null> {
  const { access } = await requireSignedIn();
  const own = ownBusiness(access.memberships);
  if (!own) return null;
  const link = await schoolLinkOf(own.businessId);
  return link === null ? null : { businessId: own.businessId, businessName: own.businessName, link };
}
