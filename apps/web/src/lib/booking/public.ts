import 'server-only';
import type { CancellationPolicy } from '@repo/core/cancellation';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const lessonSchema = z.object({
  lessonTypeId: z.string(),
  name: z.string(),
  durationMinutes: z.number(),
  pricePence: z.number(),
});

const pageSchema = z.object({
  instructorId: z.string(),
  name: z.string(),
  photoPath: z.string().nullable(),
  transmission: z.string(),
  car: z.string().nullable(),
  businessName: z.string(),
  instantBook: z.boolean(),
  /** The Business's own colour, where the plan carries it (D-210). Null is the default black. */
  brandColour: z.string().nullable().default(null),
  logoUrl: z.string().nullable().default(null),
  /** The platform checked the badge itself, rather than a school vouching for the instructor (D-280). */
  platformChecked: z.boolean().default(false),
  /**
   * Whether the person looking can start with them: not while a Free list is full, unless they are
   * already with the Business (D-208, D-357). True where the database has yet to say.
   */
  takingNewLearners: z.boolean().default(true),
  lessons: z.array(lessonSchema),
});

export type BookingPage = z.infer<typeof pageSchema>;
export type PublicLesson = z.infer<typeof lessonSchema>;

/** What a booking link shows (BOK-02). Null when it belongs to nobody who takes bookings. */
export async function bookingPage(slug: string): Promise<BookingPage | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('booking_page', { p_slug: slug });
  if (error || data === null) return null;

  const parsed = pageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

const policySchema = z.object({ windowHours: z.number(), lateFeePercent: z.number() });

/**
 * The cancellation policy a learner books this instructor under, to say before they book (BOK-09,
 * R-06). Null when the link takes no bookings, or the policy cannot be read: the page books as it
 * did, without the line.
 */
export async function cancellationPolicy(instructorId: string): Promise<CancellationPolicy | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('cancellation_policy', { p_instructor_id: instructorId });
  if (error || data === null) return null;

  const parsed = policySchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * The times a learner could take on one day (BOK-02, R-04). A lesson being moved is left out
 * of the diary, because it is not in its own way (BOK-08).
 */
export async function openSlots(
  instructorId: string,
  date: string,
  durationMinutes: number,
  exceptBookingId?: string,
): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('open_slots', {
    p_instructor_id: instructorId,
    p_date: date,
    p_duration_minutes: durationMinutes,
    ...(exceptBookingId ? { p_except_booking_id: exceptBookingId } : {}),
  });
  // Postgres writes an offset rather than a Z, and every other instant in the app is a Z.
  return error ? [] : data.map((one) => new Date(one).toISOString());
}
