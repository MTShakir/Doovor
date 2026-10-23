import 'server-only';
import { requireSignedIn } from '@/lib/auth/session';
import { listLearners } from '@/lib/learners/list';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface GalleryContext {
  businessId: string;
  businessName: string;
  /** The Business own colour, so the screen previews the banner as the public page draws it. */
  colour: string | null;
  /** Whether its plan carries the gallery, which anybody who works there may ask (D-374). */
  open: boolean;
  /** Who can be picked from the list. Anybody else is typed in (D-218). */
  learners: { id: string; name: string }[];
}

/**
 * Where a pass photo would go, and whether the plan carries it (D-218). Null for somebody who
 * works nowhere: the wall belongs to a Business.
 *
 * Not only owners. An instructor at a school posts their own pass photos, onto the school's wall,
 * because the school's profile is the page their learners are looking at.
 */
export async function galleryContext(): Promise<GalleryContext | null> {
  const { access } = await requireSignedIn();
  const membership = access.memberships.find((one) => one.role === 'owner') ?? access.memberships[0];
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: business }, { data: open }, learners] = await Promise.all([
    supabase.from('businesses').select('id, name, brand_colour').eq('id', membership.businessId).maybeSingle(),
    // Not the plan itself, which is the owner's (D-123): an instructor or manager at a school
    // on the School plan was told the gallery is part of Pro (D-374).
    supabase.rpc('gallery_is_open', { p_business_id: membership.businessId }),
    // The ones this person teaches, as the learner list shows them: a school instructor is
    // offered their own, and somebody who runs the Business is offered everybody's.
    listLearners({
      businessId: membership.businessId,
      instructorProfileId: membership.role === 'owner' || membership.role === 'manager' ? null : membership.instructorProfileId,
      filter: 'all',
      search: '',
    }),
  ]);
  if (!business) return null;

  return {
    businessId: business.id,
    businessName: business.name,
    colour: business.brand_colour,
    open: open === true,
    learners: learners.map((one) => ({ id: one.learnerId, name: one.fullName })),
  };
}

/**
 * Whether the gallery is open to this person, for the More menu's row: the same question the
 * screen asks, of the same Business (D-374).
 */
export async function galleryIsOpen(): Promise<boolean> {
  const { access } = await requireSignedIn();
  const membership = access.memberships.find((one) => one.role === 'owner') ?? access.memberships[0];
  if (!membership) return false;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('gallery_is_open', { p_business_id: membership.businessId });
  return data === true;
}
