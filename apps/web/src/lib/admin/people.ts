import 'server-only';
import { formatUkMobile } from '@repo/core/phone';
import { formatDate, formatDateTime, formatDateWithYear } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MemberRole } from './businesses';

export type BadgeState = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export interface AdminInstructorRow {
  userId: string;
  /** The name on their profile. */
  name: string;
  email: string | null;
  businessName: string;
  verification: BadgeState;
  suspended: boolean;
}

export interface AdminLearnerRow {
  userId: string;
  name: string;
  email: string | null;
  businesses: number;
  suspended: boolean;
}

/** Instructors platform staff are looking for (ADM-02, M5-18), newest first. */
export async function findInstructors(query: string): Promise<AdminInstructorRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_instructors', query === '' ? {} : { p_query: query });
  if (error) throw new Error(`Could not search instructors: ${error.message}`);
  return data.map((row) => ({
    userId: row.user_id,
    name: row.display_name,
    email: row.email,
    businessName: row.business_name,
    verification: row.verification_status,
    suspended: row.suspended,
  }));
}

/** Learners platform staff are looking for (ADM-02, M5-18), newest first. */
export async function findLearners(query: string): Promise<AdminLearnerRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_learners', query === '' ? {} : { p_query: query });
  if (error) throw new Error(`Could not search learners: ${error.message}`);
  return data.map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    businesses: row.businesses,
    suspended: row.suspended,
  }));
}

const personSchema = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  created_at: z.string(),
  last_sign_in_at: z.string().nullable(),
  two_step: z.boolean(),
  staff_role: z.enum(['super_admin', 'support_admin']).nullable(),
  suspension: z.object({ at: z.string(), reason: z.string(), by_name: z.string().nullable() }).nullable(),
  memberships: z.array(
    z.object({
      business_id: z.string(),
      business_name: z.string(),
      business_status: z.enum(['pending', 'active', 'suspended']),
      role: z.enum(['owner', 'manager', 'instructor']),
      active: z.boolean(),
    }),
  ),
  learns_with: z.array(z.object({ business_id: z.string(), business_name: z.string() })),
});

export interface AdminPerson {
  userId: string;
  name: string;
  email: string | null;
  /** As people write it: "07700 900123". */
  phone: string | null;
  /** "Mon 2 Mar 2026" */
  joinedOn: string;
  /** "Tue 15 Sep, 14:30", or null for somebody who has never signed in. */
  lastSignedIn: string | null;
  twoStep: boolean;
  staffRole: 'super_admin' | 'support_admin' | null;
  suspension: { since: string; reason: string; byName: string | null } | null;
  memberships: { businessId: string; businessName: string; businessSuspended: boolean; role: MemberRole; active: boolean }[];
  learnsWith: { businessId: string; businessName: string }[];
}

/** One person as platform staff see them (ADM-02, M5-18). Null when there is nobody by that id. */
export async function adminPerson(userId: string): Promise<AdminPerson | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_person', { p_user_id: userId });
  if (error) throw new Error(`Could not read the person: ${error.message}`);
  if (data === null) return null;
  const person = personSchema.parse(data);

  return {
    userId: person.user_id,
    name: person.name ?? 'No name given',
    email: person.email,
    phone: person.phone === null ? null : formatUkMobile(person.phone),
    joinedOn: formatDateWithYear(new Date(person.created_at)),
    lastSignedIn: person.last_sign_in_at === null ? null : formatDateTime(new Date(person.last_sign_in_at)),
    twoStep: person.two_step,
    staffRole: person.staff_role,
    suspension:
      person.suspension === null
        ? null
        : { since: formatDate(new Date(person.suspension.at)), reason: person.suspension.reason, byName: person.suspension.by_name },
    memberships: person.memberships.map((one) => ({
      businessId: one.business_id,
      businessName: one.business_name,
      businessSuspended: one.business_status === 'suspended',
      role: one.role,
      active: one.active,
    })),
    learnsWith: person.learns_with.map((one) => ({ businessId: one.business_id, businessName: one.business_name })),
  };
}
