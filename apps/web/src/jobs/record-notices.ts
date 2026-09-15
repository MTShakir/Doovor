import 'server-only';
import { notificationCatalogue, planNotifications, type NotificationChannel, type PlannedNotification } from '@repo/core/notifications';
import { formatDate, formatTime } from '@repo/core/time';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';

/** What `system_lesson_record_notice` answers. */
export interface LessonRecordNotice {
  lesson_record_id: string;
  business_id: string;
  learner_user_id: string;
  learner_name: string;
  instructor_name: string;
  lesson_starts_at: string;
  summary: string;
}

/** Room in a notification for what the instructor wrote: the whole line has 400 characters. */
const SUMMARY_ROOM = 300;

/**
 * What the instructor wrote, cut at a word to fit a notification, with three dots where it was cut:
 * the record itself is always there to read in full.
 */
export function inRoom(text: string, room = SUMMARY_ROOM): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= room) return clean;
  const cut = clean.slice(0, room - 3);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > room / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:]+$/, '')}...`;
}

/**
 * The learner is told their lesson record is ready (NTF-03, PRD 10.2 step 4, M4-12): the lesson it
 * was, who wrote it and the line they wrote, in the inbox and on their phone, and it opens their
 * progress. Once for each record, however often the event arrives.
 */
export function planLessonRecordAdded(notice: LessonRecordNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  const startsAt = new Date(notice.lesson_starts_at);
  return planNotifications({
    kind: 'lesson_record.added',
    entityId: notice.lesson_record_id,
    facts: {
      learnerName: notice.learner_name,
      instructorName: notice.instructor_name,
      when: `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
      detail: inRoom(notice.summary),
    },
    recipients: [{ userId: notice.learner_user_id, audience: 'learner', muted: muted?.get(notice.learner_user_id) }],
    linkFor: () => '/app/learner/progress',
  });
}

/**
 * Tells a learner about their saved lesson record (M4-12). Nothing for a record the Business kept
 * for itself, or one that is no longer there.
 */
export async function notifyLessonRecordAdded(lessonRecordId: string): Promise<NotifyResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_lesson_record_notice', { p_lesson_record_id: lessonRecordId });
  if (error) throw new Error(`Could not read the lesson record to notify about it: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as LessonRecordNotice;
  const muted = await mutedChannels([notice.learner_user_id], notificationCatalogue['lesson_record.added'].category);
  const planned = planLessonRecordAdded(notice, muted);
  return {
    written: await writeNotifications(
      notificationRows(planned, { businessId: notice.business_id, entityType: 'lesson_record', entityId: notice.lesson_record_id }),
    ),
  };
}
