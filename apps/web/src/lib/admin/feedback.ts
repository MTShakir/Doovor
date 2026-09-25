import 'server-only';
import { formatDateWithYear, formatTime } from '@repo/core/time';
import { feedbackKinds, feedbackPageSize, type FeedbackKind } from '@repo/core/schemas/feedback';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { feedbackBucket } from '@/lib/storage/images';

const rowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.enum(feedbackKinds),
  message: z.string(),
  images: z.array(z.string()),
  page: z.string().nullable(),
  created_at: z.string(),
  handled_at: z.string().nullable(),
  person: z.string().nullable(),
  person_email: z.string().nullable(),
  business_name: z.string().nullable(),
  business_type: z.string().nullable(),
});

const resultSchema = z.object({
  more: z.boolean(),
  new_count: z.number().int(),
  rows: z.array(rowSchema),
});

export interface FeedbackReport {
  id: string;
  userId: string;
  kind: FeedbackKind;
  message: string;
  /** Short-lived addresses for the pictures, in the order they were attached. */
  images: string[];
  /** The screen they were on when they sent it. */
  page: string | null;
  /** "Thu 24 Sep 2026, 11:13", in London. */
  sent: string;
  handled: boolean;
  person: string;
  personEmail: string | null;
  business: string | null;
  /** "School" or "Instructor", as the Business is set up. */
  businessKind: string | null;
}

export interface FeedbackPage {
  reports: FeedbackReport[];
  /** Whether there is another page after this one. */
  more: boolean;
  /** How many reports nobody has dealt with yet, across every kind. */
  waiting: number;
}

/** A Business's type as staff would say it. */
function businessKind(type: string | null): string | null {
  if (type === null) return null;
  return type === 'school' ? 'School' : type === 'independent' ? 'Independent instructor' : type;
}

/**
 * What people have told us (D-202), for the staff who can do something about it. The database
 * decides who may read it; pictures are private, so each one comes back as a short-lived address.
 */
export async function feedbackReports(
  filters: { kind?: FeedbackKind; onlyNew: boolean; page: number },
  perPage = feedbackPageSize,
): Promise<FeedbackPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_feedback', {
    p_kind: filters.kind,
    p_only_new: filters.onlyNew,
    p_limit: perPage,
    p_offset: (filters.page - 1) * perPage,
  });
  if (error) throw new Error(`Could not read what people have told us: ${error.message}`);

  const parsed = resultSchema.parse(data);
  const reports = await Promise.all(
    parsed.rows.map(async (row) => {
      const sent = new Date(row.created_at);
      const signed =
        row.images.length === 0
          ? []
          : ((await supabase.storage.from(feedbackBucket).createSignedUrls(row.images, 300)).data ?? []);
      return {
        id: row.id,
        userId: row.user_id,
        kind: row.kind,
        message: row.message,
        images: signed.map((one) => one.signedUrl).filter((one): one is string => typeof one === 'string' && one !== ''),
        page: row.page,
        sent: `${formatDateWithYear(sent)}, ${formatTime(sent)}`,
        handled: row.handled_at !== null,
        person: row.person ?? 'Somebody',
        personEmail: row.person_email,
        business: row.business_name,
        businessKind: businessKind(row.business_type),
      };
    }),
  );

  return { reports, more: parsed.more, waiting: parsed.new_count };
}
