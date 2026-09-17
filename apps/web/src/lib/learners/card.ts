import 'server-only';
import type { LearnerStatus } from '@repo/core/learners';
import { normaliseUkMobile } from '@repo/core/phone';
import type { LearnerTransmission } from '@repo/core/schemas/learner';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Pickup points arrive as JSON from the view, so they are read the way any input is. */
const pickupSchema = z.object({
  id: z.string(),
  label: z.string(),
  address: z.string(),
  postcode: z.string().nullable(),
  kind: z.string(),
  is_default: z.boolean(),
});

const pickupsSchema = z.array(pickupSchema).catch([]);

export type LearnerPickup = z.infer<typeof pickupSchema>;

export interface LearnerCard {
  learnerId: string;
  businessId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  instructorId: string | null;
  status: LearnerStatus;
  transmission: LearnerTransmission | null;
  postcode: string | null;
  instructorName: string | null;
  usualDurationMinutes: number | null;
  nextLessonAt: string | null;
  lastLessonAt: string | null;
  lessonsTaken: number;
  minutesTaught: number;
  pickups: LearnerPickup[];
}

/**
 * One learner, everything their card shows, in one query (LRN-02). Null when the person
 * asking has no business seeing them: the policies under the view decide, not this code.
 */
export async function learnerCard(learnerId: string): Promise<LearnerCard | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('learner_card')
    .select(
      'learner_id, business_id, instructor_id, full_name, phone, email, status, transmission, postcode, instructor_name, usual_duration_minutes, next_lesson_at, last_lesson_at, lessons_taken, minutes_taught, pickup_points',
    )
    .eq('learner_id', learnerId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.learner_id || !data.business_id) return null;

  return {
    learnerId: data.learner_id,
    businessId: data.business_id,
    fullName: data.full_name === null || data.full_name === '' ? 'Unnamed learner' : data.full_name,
    // Supabase Auth keeps a number without its plus, which is not a number a phone can ring.
    phone: data.phone === null ? null : (normaliseUkMobile(data.phone) ?? data.phone),
    email: data.email,
    instructorId: data.instructor_id,
    status: data.status ?? 'enquiry',
    transmission: data.transmission,
    postcode: data.postcode,
    instructorName: data.instructor_name,
    usualDurationMinutes: data.usual_duration_minutes,
    nextLessonAt: data.next_lesson_at,
    lastLessonAt: data.last_lesson_at,
    lessonsTaken: data.lessons_taken ?? 0,
    minutesTaught: data.minutes_taught ?? 0,
    pickups: pickupsSchema.parse(data.pickup_points),
  };
}

/**
 * Whether the person asking may see this learner at all (NFR-SEC-01): themselves, a learner of a
 * Business they own or manage, or one they teach. The policies on the learner's links decide, as
 * they do for the card. A learner somebody may not see is not found, just as an id that belongs to
 * nobody is (D-131).
 */
export async function mayReadLearner(learnerId: string, readerId: string): Promise<boolean> {
  if (learnerId === readerId) return true;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('learner_relationships').select('id').eq('learner_id', learnerId).limit(1);
  if (error) throw error;
  return data.length > 0;
}
