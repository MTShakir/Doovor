import 'server-only';
import { encodeLessonRecordCursor, type LessonRecordCursor } from '@repo/core/schemas/lesson-record';
import { skillMap, type SkillProgress } from '@repo/core/skill-map';
import { inReportOrder, isSkillCode, isSkillRating, type SkillCode, type SkillRating } from '@repo/core/skills';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** How many lesson records a page of a timeline holds. */
export const recordsPerPage = 10;

/**
 * A lesson record as a timeline shows it (PRG-03, M4-06). Plain data with its time as an ISO
 * string, so a page can come from the server and from the route that sends the older ones.
 */
export interface RecordedLesson {
  id: string;
  /** When the lesson started, as the database wrote it. */
  lessonStartsAt: string;
  instructorName: string;
  /** The school the lesson was with. An independent instructor's Business is the instructor. */
  schoolName: string | null;
  summary: string;
  nextFocus: string | null;
  homework: string | null;
  /** In the order of the test report. */
  ratings: { skillCode: SkillCode; rating: SkillRating }[];
}

export interface RecordPage {
  records: RecordedLesson[];
  /** Where the next page starts, or null when these are the oldest. */
  next: string | null;
}

/**
 * One page of a learner's lesson records, the latest lesson first (PRG-03, M4-06). Row-level
 * security decides which records come back: the learner's own from every Business they learn with,
 * or those of the Business the reader works in (PRD 6.2).
 */
export async function lessonRecordPage(learnerId: string, before?: LessonRecordCursor, size = recordsPerPage): Promise<RecordPage> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from('lesson_records')
    .select(
      'id, lesson_starts_at, summary, next_focus, homework, instructor_profiles(display_name), businesses(name, type), skill_ratings(skill_code, rating)',
    )
    .eq('learner_id', learnerId);
  if (before !== undefined) {
    // After the last one shown: an earlier lesson, or one at the same time with a lower id.
    query = query.or(
      `lesson_starts_at.lt."${before.startsAt}",and(lesson_starts_at.eq."${before.startsAt}",id.lt.${before.id})`,
    );
  }
  // One more than a page, which says whether there is another page after it.
  const { data, error } = await query
    .order('lesson_starts_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(size + 1);
  if (error) throw error;

  const rows = data.slice(0, size);
  const last = rows.at(-1);
  return {
    records: rows.map((row) => ({
      id: row.id,
      lessonStartsAt: row.lesson_starts_at,
      instructorName: row.instructor_profiles.display_name,
      schoolName: row.businesses.type === 'school' ? row.businesses.name : null,
      summary: row.summary,
      nextFocus: row.next_focus,
      homework: row.homework,
      ratings: inReportOrder(
        row.skill_ratings.flatMap((one) =>
          isSkillCode(one.skill_code) && isSkillRating(one.rating) ? [{ skillCode: one.skill_code, rating: one.rating }] : [],
        ),
      ),
    })),
    next: data.length > size && last !== undefined ? encodeLessonRecordCursor({ startsAt: last.lesson_starts_at, id: last.id }) : null,
  };
}

/**
 * A learner's skill map (PRG-03, M4-07): every area, at its rating from the latest lesson that
 * rated it, made of the records the reader may read.
 */
export async function learnerSkillMap(learnerId: string): Promise<SkillProgress[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('skill_progress')
    .select('skill_code, rating, times, last_rated_at')
    .eq('learner_id', learnerId);
  if (error) throw error;

  return skillMap(
    data.flatMap((row) =>
      isSkillCode(row.skill_code) && isSkillRating(row.rating) && row.last_rated_at !== null
        ? [{ skillCode: row.skill_code, rating: row.rating, at: new Date(row.last_rated_at), times: row.times ?? 1 }]
        : [],
    ),
  );
}
