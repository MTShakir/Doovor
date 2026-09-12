import 'server-only';
import { searchPattern, statusesForFilter, type LearnerFilter, type LearnerStatus } from '@repo/core/learners';
import { normaliseUkMobile } from '@repo/core/phone';
import type { LearnerTransmission } from '@repo/core/schemas/learner';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LearnerRow {
  id: string;
  learnerId: string;
  fullName: string;
  phone: string | null;
  status: LearnerStatus;
  transmission: LearnerTransmission | null;
  instructorName: string | null;
  nextLessonAt: string | null;
  lessonsTaken: number;
}

export interface LearnerListQuery {
  businessId: string;
  /** An instructor sees the learners assigned to them; a school sees all of them. */
  instructorProfileId?: string | null;
  filter: LearnerFilter;
  search: string;
}

/**
 * The learner list (LRN-01). One query against `learner_list`, which already carries the
 * lesson counts, so the number of learners does not change the number of queries.
 */
export async function listLearners(query: LearnerListQuery): Promise<LearnerRow[]> {
  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from('learner_list')
    .select('id, learner_id, full_name, phone, status, transmission, instructor_name, next_lesson_at, lessons_taken')
    .eq('business_id', query.businessId)
    .in('status', [...statusesForFilter(query.filter)]);

  if (query.instructorProfileId) request = request.eq('instructor_id', query.instructorProfileId);

  const pattern = searchPattern(query.search);
  if (pattern !== '') request = request.ilike('search_text', pattern);

  const { data, error } = await request.order('full_name').limit(200);
  if (error) throw error;

  // Every column of a view is nullable as far as the generated types know, so the few this
  // list cannot do without are given something sensible rather than trusted.
  return data.map((row) => ({
    id: row.id ?? '',
    learnerId: row.learner_id ?? '',
    fullName: row.full_name === null || row.full_name === '' ? 'Unnamed learner' : row.full_name,
    // Supabase Auth keeps a number without its plus, which is not a number a phone can ring.
    phone: row.phone === null ? null : (normaliseUkMobile(row.phone) ?? row.phone),
    status: row.status ?? 'enquiry',
    transmission: row.transmission,
    instructorName: row.instructor_name,
    nextLessonAt: row.next_lesson_at,
    lessonsTaken: row.lessons_taken ?? 0,
  }));
}
