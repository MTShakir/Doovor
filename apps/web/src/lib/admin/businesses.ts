import 'server-only';
import { formatUkMobile } from '@repo/core/phone';
import { formatDate, formatDateWithYear } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type BusinessType = 'independent' | 'school';
export type BusinessStanding = 'pending' | 'active' | 'suspended';
export type MemberRole = 'owner' | 'manager' | 'instructor';

export interface AdminBusinessRow {
  businessId: string;
  name: string;
  type: BusinessType;
  status: BusinessStanding;
  postcode: string | null;
  ownerName: string | null;
  instructors: number;
}

/**
 * Businesses platform staff are looking for (ADM-02, M5-18): by name, postcode, or the name, email
 * or mobile of somebody who works there, newest first. The newest, when nothing is typed.
 */
export async function findBusinesses(query: string): Promise<AdminBusinessRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_businesses', query === '' ? {} : { p_query: query });
  if (error) throw new Error(`Could not search Businesses: ${error.message}`);
  return data.map((row) => ({
    businessId: row.business_id,
    name: row.name,
    type: row.type,
    status: row.status,
    postcode: row.base_postcode,
    ownerName: row.owner_name,
    instructors: row.instructors,
  }));
}

const detailSchema = z.object({
  business_id: z.string(),
  name: z.string(),
  type: z.enum(['independent', 'school']),
  status: z.enum(['pending', 'active', 'suspended']),
  base_postcode: z.string().nullable(),
  created_at: z.string(),
  takes_cards: z.boolean(),
  suspended_at: z.string().nullable(),
  suspension_reason: z.string().nullable(),
  suspended_by_name: z.string().nullable(),
  members: z.array(
    z.object({
      user_id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      role: z.enum(['owner', 'manager', 'instructor']),
      active: z.boolean(),
      verification_status: z.enum(['unsubmitted', 'pending', 'approved', 'rejected']).nullable(),
    }),
  ),
  learners: z.number().int(),
  lessons_to_come: z.number().int(),
});

export interface AdminMember {
  userId: string;
  name: string;
  /** Their email, or their mobile as people write it, or null when there is neither. */
  contact: string | null;
  role: MemberRole;
  active: boolean;
  /** Where their badge is, for somebody who teaches; null for somebody who does not. */
  verification: 'unsubmitted' | 'pending' | 'approved' | 'rejected' | null;
}

export interface AdminBusiness {
  businessId: string;
  name: string;
  type: BusinessType;
  status: BusinessStanding;
  postcode: string | null;
  /** "Tue 15 Sep 2026" */
  joinedOn: string;
  takesCards: boolean;
  /** While it is suspended: since when, why and by whom, each null where the database has no record of it. */
  suspension: { since: string | null; reason: string | null; byName: string | null } | null;
  members: AdminMember[];
  learners: number;
  lessonsToCome: number;
}

/** One Business as platform staff see it (ADM-02, M5-18). Null when there is no such Business. */
export async function adminBusiness(businessId: string): Promise<AdminBusiness | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_business', { p_business_id: businessId });
  if (error) throw new Error(`Could not read the Business: ${error.message}`);
  if (data === null) return null;
  const business = detailSchema.parse(data);

  return {
    businessId: business.business_id,
    name: business.name,
    type: business.type,
    status: business.status,
    postcode: business.base_postcode,
    joinedOn: formatDateWithYear(new Date(business.created_at)),
    takesCards: business.takes_cards,
    suspension:
      business.status === 'suspended'
        ? {
            since: business.suspended_at === null ? null : formatDate(new Date(business.suspended_at)),
            reason: business.suspension_reason,
            byName: business.suspended_by_name,
          }
        : null,
    members: business.members.map((member) => ({
      userId: member.user_id,
      name: member.name ?? 'No name given',
      contact: member.email ?? (member.phone === null ? null : formatUkMobile(member.phone)),
      role: member.role,
      active: member.active,
      verification: member.verification_status,
    })),
    learners: business.learners,
    lessonsToCome: business.lessons_to_come,
  };
}
