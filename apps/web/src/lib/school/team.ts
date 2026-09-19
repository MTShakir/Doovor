import 'server-only';
import { formatDate } from '@repo/core/time';
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
      set_own_prices: z.boolean(),
      view_revenue: z.boolean(),
      lessons_to_come: z.number().int(),
    }),
  ),
  invitations: z.array(
    z.object({
      invitation_id: z.string(),
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
}

export interface WaitingInvitation {
  invitationId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  expiresAt: string;
  /** "Wed 30 Sep", worked out here: a client component may not read dates while a page is prerendered. */
  expiresOn: string;
}

export interface SchoolTeam {
  members: TeamMember[];
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
    })),
    invitations: team.invitations.map((one) => ({
      invitationId: one.invitation_id,
      fullName: one.full_name,
      email: one.email,
      phone: one.phone,
      expiresAt: one.expires_at,
      expiresOn: formatDate(new Date(one.expires_at)),
    })),
  };
}
