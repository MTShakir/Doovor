import 'server-only';
import { asksForCard, chosenPaymentMode } from '@repo/core/payment-modes';
import { instructorProfilePath, schoolProfilePath } from '@repo/core/public-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface MyLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string;
  instructorId: string;
  instructorName: string;
  lessonType: string;
  pricePence: number;
  pickup: string | null;
  durationMinutes: number;
  /** True when this Business can take a card, so an unpaid lesson can be paid for now. */
  canPayNow: boolean;
  /** The terms it was booked on, which decide what paying for it means (PAY-03). */
  paymentMode: string;
  /** For a lesson marked as a no-show, until when it can be disputed (R-09). */
  disputeUntil: string | null;
  /** Their dispute of a no-show, and how it was decided: `outcome` stays null until it is. */
  dispute: { outcome: 'waived' | 'kept' | null; note: string | null } | null;
}

/** The learner's own lessons (PRD 8.2). Row-level security answers for them, not this. */
export async function myLessons(): Promise<{ upcoming: MyLesson[]; past: MyLesson[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, payment_status, payment_mode, price_pence, dispute_until, instructor_id, instructor_profiles(display_name), lesson_types(name), pickup_points(label), businesses!bookings_business_id_fkey(stripe_charges_enabled, settings), no_show_disputes(outcome, note)',
    )
    .order('starts_at', { ascending: false })
    .limit(200);
  if (error) throw error;

  const now = Date.now();
  const off = ['cancelled', 'expired', 'declined', 'no_show'];
  const all = data.map((row) => ({
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMode: row.payment_mode,
    instructorId: row.instructor_id,
    instructorName: row.instructor_profiles.display_name,
    lessonType: row.lesson_types.name,
    pricePence: row.price_pence,
    pickup: row.pickup_points?.label ?? null,
    disputeUntil: row.dispute_until,
    dispute: row.no_show_disputes === null ? null : { outcome: row.no_show_disputes.outcome, note: row.no_show_disputes.note },
    durationMinutes: Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000),
    // A request is paid for with an authorisation, and one already authorised has nothing left
    // to do until it is answered (R-12).
    canPayNow:
      asksForCard({
        chargesEnabled: row.businesses.stripe_charges_enabled,
        mode: chosenPaymentMode(row.businesses.settings),
      }) &&
      (row.status === 'requested' ? ['unpaid', 'failed'] : ['unpaid', 'pending', 'failed']).includes(row.payment_status),
  }));

  return {
    upcoming: all
      .filter((lesson) => new Date(lesson.startsAt).getTime() >= now && !off.includes(lesson.status))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    past: all.filter((lesson) => new Date(lesson.startsAt).getTime() < now || off.includes(lesson.status)),
  };
}

export interface MyLessonDetails extends MyLesson {
  /** Which of their own pickup points this lesson is collected from, if any (COV-04, D-185). */
  pickupPointId: string | null;
  pickupAddress: string | null;
  pickupPostcode: string | null;
  /** Their instructor's public profile, where there is one to send them to (PUB-01). */
  instructorProfile: string | null;
  businessName: string;
  /** The school's own profile, when they learn with a school rather than one instructor (PRD 8.3). */
  schoolProfile: string | null;
  /** Whether the lesson is still one they can say where to be collected for. */
  changeable: boolean;
}

/**
 * One of the learner's own lessons, with everything their side of it needs (PRD 8.2, D-185):
 * where they are collected, and who is teaching them. Null when it is not a lesson of theirs,
 * which the policies decide rather than this.
 */
export async function myLesson(bookingId: string): Promise<MyLessonDetails | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, starts_at, ends_at, status, payment_status, payment_mode, price_pence, dispute_until, instructor_id, pickup_point_id, instructor_profiles(display_name, public_slug, verification_status), lesson_types(name), pickup_points(label, address, postcode), businesses!bookings_business_id_fkey(name, type, slug, status, stripe_charges_enabled, settings), no_show_disputes(outcome, note)',
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const business = data.businesses;
  const instructor = data.instructor_profiles;
  const live = business.status === 'active';
  return {
    id: data.id,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    paymentStatus: data.payment_status,
    paymentMode: data.payment_mode,
    instructorId: data.instructor_id,
    instructorName: instructor.display_name,
    lessonType: data.lesson_types.name,
    pricePence: data.price_pence,
    pickup: data.pickup_points?.label ?? null,
    pickupPointId: data.pickup_point_id,
    pickupAddress: data.pickup_points?.address ?? null,
    pickupPostcode: data.pickup_points?.postcode ?? null,
    disputeUntil: data.dispute_until,
    dispute: data.no_show_disputes === null ? null : { outcome: data.no_show_disputes.outcome, note: data.no_show_disputes.note },
    durationMinutes: Math.round((new Date(data.ends_at).getTime() - new Date(data.starts_at).getTime()) / 60_000),
    canPayNow:
      asksForCard({ chargesEnabled: business.stripe_charges_enabled, mode: chosenPaymentMode(business.settings) }) &&
      (data.status === 'requested' ? ['unpaid', 'failed'] : ['unpaid', 'pending', 'failed']).includes(data.payment_status),
    // A profile exists once the platform has checked them, and while their Business is in good
    // standing: the same rule the public page itself keeps, so a link never leads to nothing.
    instructorProfile:
      live && instructor.verification_status === 'approved' && instructor.public_slug !== null
        ? instructorProfilePath(null, instructor.public_slug)
        : null,
    businessName: business.name,
    schoolProfile: live && business.type === 'school' ? schoolProfilePath(null, business.slug) : null,
    changeable: ['requested', 'pending_payment', 'confirmed'].includes(data.status) && new Date(data.ends_at).getTime() > Date.now(),
  };
}
