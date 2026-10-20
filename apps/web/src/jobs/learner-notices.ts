import 'server-only';
import {
  notificationCatalogue,
  planNotifications,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationRecipient,
  type PlannedNotification,
} from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';

/** What `system_learner_joined_notice` answers. */
export interface LearnerJoinedNotice {
  invitation_id: string;
  business_id: string;
  learner_user_id: string;
  /** Null when neither the learner nor the invitation gave a name. */
  learner_name: string | null;
  /** The instructor the learner is now with. Null when their profile has gone since. */
  instructor_user_id: string | null;
  instructor_name: string | null;
  /** The school's owners and managers, when the instructor teaches for one. */
  school_staff_ids: string[];
}

/** The instructor, and the school's people when there is a school, each muted as they chose (NTF-04). */
function recipientsFor(notice: LearnerJoinedNotice, muted?: Map<string, NotificationChannel[]>): NotificationRecipient[] {
  const instructor: NotificationRecipient[] =
    notice.instructor_user_id === null ? [] : [{ userId: notice.instructor_user_id, audience: 'instructor', muted: muted?.get(notice.instructor_user_id) }];
  return [...instructor, ...notice.school_staff_ids.map((userId) => ({ userId, audience: 'school' as const, muted: muted?.get(userId) }))];
}

/**
 * An invitation accepted (LRN-03, Appendix B "New learner invite accepted", D-301): the instructor
 * who sent it hears their learner has joined and can be booked in, and the school they teach for
 * hears who joined and who invited them. Tapping it opens the learner's card, or the school's
 * learners. Once for each invitation, however often the event arrives.
 */
export function planLearnerJoined(notice: LearnerJoinedNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  return planNotifications({
    kind: 'learner.joined',
    entityId: notice.invitation_id,
    facts: { learnerName: notice.learner_name ?? undefined, instructorName: notice.instructor_name ?? undefined },
    recipients: recipientsFor(notice, muted),
    linkFor: (audience: NotificationAudience) =>
      audience === 'school' ? '/app/school/learners' : `/app/instructor/learners/${notice.learner_user_id}`,
  });
}

/** Tells an instructor, and their school, that a learner they invited has joined. Nothing for an invitation that is gone. */
export async function notifyLearnerJoined(invitationId: string): Promise<NotifyResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_learner_joined_notice', { p_invitation_id: invitationId });
  if (error) throw new Error(`Could not read the invitation to notify about: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as LearnerJoinedNotice;
  const everybody = [...(notice.instructor_user_id === null ? [] : [notice.instructor_user_id]), ...notice.school_staff_ids];
  const muted = await mutedChannels(everybody, notificationCatalogue['learner.joined'].category);
  return {
    written: await writeNotifications(
      notificationRows(planLearnerJoined(notice, muted), { businessId: notice.business_id, entityType: 'invitation', entityId: notice.invitation_id }),
    ),
  };
}
