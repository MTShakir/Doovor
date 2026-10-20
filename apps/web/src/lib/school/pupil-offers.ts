import 'server-only';
import { formatUkMobile } from '@repo/core/phone';
import { formatDateTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The function answers JSON, so it is read the way any input is.
const offersSchema = z.array(
  z.object({
    offerId: z.string(),
    enquiryId: z.string(),
    status: z.enum(['open', 'accepted']),
    schoolName: z.string(),
    expiresAt: z.string(),
    firstName: z.string(),
    district: z.string(),
    transmission: z.enum(['manual', 'automatic']).nullable(),
    note: z.string().nullable(),
    fullName: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    postcode: z.string().nullable(),
    learnerAdded: z.boolean(),
  }),
);

/** A pupil the school offered the instructor, or one they accepted (M9-17, D-289). */
export interface PupilOffer {
  offerId: string;
  enquiryId: string;
  status: 'open' | 'accepted';
  schoolName: string;
  /** "Wed 21 Oct, 14:00", worked out here: a client component may not read dates while prerendering. */
  answerBy: string;
  firstName: string;
  /** Their postcode district, such as M1. */
  district: string;
  transmission: 'manual' | 'automatic' | null;
  note: string | null;
  /** Who they are and how to reach them, once the instructor has accepted. */
  contact: { fullName: string; email: string | null; phone: string | null; phoneE164: string | null; postcode: string } | null;
  /** They are on the instructor's own list of learners already. */
  learnerAdded: boolean;
}

/** What the school has offered a linked instructor's Business, and the pupils it accepted. */
export async function pupilOffersFor(businessId: string): Promise<PupilOffer[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('pupil_offers_for', { p_business_id: businessId });
  if (error) return [];
  const parsed = offersSchema.safeParse(data);
  if (!parsed.success) return [];
  return parsed.data.map((one) => ({
    offerId: one.offerId,
    enquiryId: one.enquiryId,
    status: one.status,
    schoolName: one.schoolName,
    answerBy: formatDateTime(new Date(one.expiresAt)),
    firstName: one.firstName,
    district: one.district,
    transmission: one.transmission,
    note: one.note,
    contact:
      one.status === 'accepted' && one.fullName !== null && one.postcode !== null
        ? {
            fullName: one.fullName,
            email: one.email,
            phone: one.phone === null ? null : formatUkMobile(one.phone),
            phoneE164: one.phone,
            postcode: one.postcode,
          }
        : null,
    learnerAdded: one.learnerAdded,
  }));
}
