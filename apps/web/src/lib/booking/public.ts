import 'server-only';
import { z } from 'zod';
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
