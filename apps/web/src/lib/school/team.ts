import 'server-only';
import { formatCalendarDate, formatDate } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The function answers JSON, so it is read the way any input is.
const teamSchema = z.object({
  members: z.array(
    z.object({
      membership_id: z.string(),
      is_you: z.boolean(),
      role: z.enum(['manager', 'instructor']),
      active: z.boolean(),
      name: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      instructor_id: z.string().nullable(),
      photo_path: z.string().nullable(),
      qualification: z.enum(['adi', 'pdi']).nullable().default(null),
      supervised: z.boolean().default(false),
      set_own_prices: z.boolean(),
      view_revenue: z.boolean(),
      lessons_to_come: z.number().int(),
      learners: z.number().int().default(0),
    }),
  ),
  linked: z
    .array(
      z.object({
        link_id: z.string(),
        business_id: z.string(),
        business_name: z.string(),
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        instructor_id: z.string().nullable(),
        photo_path: z.string().nullable(),
        qualification: z.enum(['adi', 'pdi']).nullable(),
        badge_expiry: z.string().nullable(),
        linked_at: z.string(),
      }),
    )
    .default([]),
  invitations: z.array(
    z.object({
      invitation_id: z.string(),
      kind: z.enum(['member', 'link']).default('member'),
      role: z.enum(['owner', 'manager', 'instructor']).nullable().default(null),
      full_name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      expires_at: z.string(),
    }),
  ),
});

export interface TeamMember {
  membershipId: string;
  /** The person looking: nobody changes what they may do themselves. */
  isYou: boolean;
  role: 'manager' | 'instructor';
  active: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  /** Their profile at the school, for somebody who teaches there. */
  instructorId: string | null;
  photoPath: string | null;
  setOwnPrices: boolean;
  viewRevenue: boolean;
  lessonsToCome: number;
  /** The learners they teach at the school, who stay with them when they are switched off (D-317). */
  learners: number;
  /** A trainee, who can be booked only while somebody supervises them (INS-04, R-18). */
  trainee: boolean;
  /** Whether the school answers for them as a trainee (D-342). */
  supervised: boolean;
}

/** An instructor who sells their own lessons, by the Business they run, linked to the school (D-282). */
export interface LinkedInstructor {
  linkId: string;
  businessId: string;
  businessName: string;
  name: string;
  email: string | null;
  phone: string | null;
  instructorId: string | null;
  photoPath: string | null;
  qualification: 'adi' | 'pdi' | null;
  /** When their badge runs out, in words, worked out here: a client component may not read dates while prerendering. */
  badgeExpiresOn: string | null;
  linkedOn: string;
}

export interface WaitingInvitation {
  invitationId: string;
  kind: 'member' | 'link' | 'manager';
  fullName: string | null;
  email: string | null;
  phone: string | null;
  expiresAt: string;
  /** "Wed 30 Sep", worked out here: a client component may not read dates while a page is prerendered. */
  expiresOn: string;
}

export interface SchoolTeam {
  members: TeamMember[];
  linked: LinkedInstructor[];
  invitations: WaitingInvitation[];
}

/**
 * Everybody at a school but its owner, and the invitations still waiting (SCH-02, M5-13). The
 * database decides who may see it. Throws when it cannot be read, rather than showing nobody.
 */
export async function schoolTeam(businessId: string): Promise<SchoolTeam> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('school_team', { p_business_id: businessId });
  if (error) throw new Error(`Could not read the school's team: ${error.message}`);
  const team = teamSchema.parse(data);

  return {
    members: team.members.map((one) => ({
      membershipId: one.membership_id,
      isYou: one.is_you,
      role: one.role,
      active: one.active,
      name: one.name,
      email: one.email,
      phone: one.phone,
      instructorId: one.instructor_id,
      photoPath: one.photo_path,
      setOwnPrices: one.set_own_prices,
      viewRevenue: one.view_revenue,
      lessonsToCome: one.lessons_to_come,
      learners: one.learners,
      trainee: one.qualification === 'pdi',
      supervised: one.supervised,
    })),
    linked: team.linked.map((one) => ({
      linkId: one.link_id,
      businessId: one.business_id,
      businessName: one.business_name,
      name: one.name,
      email: one.email,
      phone: one.phone,
      instructorId: one.instructor_id,
      photoPath: one.photo_path,
      qualification: one.qualification,
      badgeExpiresOn: one.badge_expiry === null ? null : formatCalendarDate(one.badge_expiry),
      linkedOn: formatDate(new Date(one.linked_at)),
    })),
    invitations: team.invitations.map((one) => ({
      invitationId: one.invitation_id,
      // A member invitation for a manager is its own kind on the screen (D-293).
      kind: one.kind === 'member' && one.role === 'manager' ? 'manager' : one.kind,
      fullName: one.full_name,
      email: one.email,
      phone: one.phone,
      expiresAt: one.expires_at,
      expiresOn: formatDate(new Date(one.expires_at)),
    })),
  };
}
