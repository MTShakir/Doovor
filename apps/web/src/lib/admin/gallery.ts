import 'server-only';
import { formatCalendarDate, formatDateWithYear, formatTime } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** How many photos a page of the admin wall shows. */
export const galleryAdminPageSize = 24;

const rowSchema = z.object({
  id: z.uuid(),
  learner_name: z.string(),
  passed_on: z.string(),
  image_path: z.string(),
  created_at: z.string(),
  verified_at: z.string().nullable(),
  hidden_at: z.string().nullable(),
  from_the_list: z.boolean(),
  business_id: z.uuid(),
  business_name: z.string(),
  business_type: z.string(),
  business_slug: z.string(),
  instructor_name: z.string().nullable(),
});

const resultSchema = z.object({
  more: z.boolean(),
  unchecked_count: z.number().int(),
  rows: z.array(rowSchema),
});

export interface AdminGalleryPhoto {
  id: string;
  learnerName: string;
  /** "Tue 15 Sep 2026". */
  passedOn: string;
  /** The day itself, for the banner the public page draws. */
  passedOnDate: string;
  imagePath: string;
  /** "Thu 24 Sep 2026, 11:13", in London. */
  added: string;
  verified: boolean;
  hidden: boolean;
  /** Whether the name came from a learner on the books, or was typed in (D-218). */
  fromTheList: boolean;
  businessId: string;
  businessName: string;
  businessSlug: string;
  /** "School" or "Independent instructor". */
  businessKind: string;
  instructorName: string | null;
}

export interface AdminGalleryPage {
  photos: AdminGalleryPhoto[];
  more: boolean;
  /** How many nobody has looked at yet: not ticked and not taken down. */
  unchecked: number;
}

/**
 * Every Business wall, for the staff who check them (D-218). The database decides who may read
 * it. Pictures are in a public bucket, so the path is enough; nothing here is signed.
 */
export async function adminGallery(filters: {
  businessId?: string;
  onlyUnchecked: boolean;
  page: number;
}): Promise<AdminGalleryPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('admin_gallery', {
    p_business_id: filters.businessId,
    p_only_unchecked: filters.onlyUnchecked,
    p_limit: galleryAdminPageSize,
    p_offset: (filters.page - 1) * galleryAdminPageSize,
  });
  if (error) throw new Error(`Could not read the galleries: ${error.message}`);

  const parsed = resultSchema.parse(data);
  return {
    photos: parsed.rows.map((row) => {
      const added = new Date(row.created_at);
      return {
        id: row.id,
        learnerName: row.learner_name,
        passedOn: formatCalendarDate(row.passed_on),
        passedOnDate: row.passed_on,
        imagePath: row.image_path,
        added: `${formatDateWithYear(added)}, ${formatTime(added)}`,
        verified: row.verified_at !== null,
        hidden: row.hidden_at !== null,
        fromTheList: row.from_the_list,
        businessId: row.business_id,
        businessName: row.business_name,
        businessSlug: row.business_slug,
        businessKind: row.business_type === 'school' ? 'School' : 'Independent instructor',
        instructorName: row.instructor_name,
      };
    }),
    more: parsed.more,
    unchecked: parsed.unchecked_count,
  };
}
