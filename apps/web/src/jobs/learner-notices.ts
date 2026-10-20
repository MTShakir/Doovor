import 'server-only';
import {
  notificationCatalogue,
  planNotifications,
  type NotificationAudience,
  type NotificationChannel,
  type PlannedNotification,
} from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';

/** What `system_learner_joined_notice` answers. */
export interface LearnerJoinedNotice {
  invitation_id: string;
  business_id: string;
  learner_id: string;
  learner_name: string;
  /** The instructor the invitation named, or the one the learner has now. */
  instructor_name: string | null;
  recipients: { user_id: string; audience: NotificationAudience }[];
}

/** The learner's card for whoever teaches them, and the school's list for the people who run it. */
export function learnerJoinedLink(notice: LearnerJoinedNotice, audience: NotificationAudience): string {
  return audience === 'school' ? '/app/school/learners' : `/app/instructor/learners/${notice.learner_id}`;
}

/**
 * A learner accepted an invitation (NTF-03, PRD Appendix B "New learner invite accepted", D-297):
 * the instructor it came from, or the owner of a Business of one, and a school's owner and
 * managers hear that they joined, in the inbox and by push. Once for each invitation.
 */
export function planLearnerJoined(notice: LearnerJoinedNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  return planNotifications({
    kind: 'learner.joined',
    entityId: notice.invitation_id,
    facts: { learnerName: notice.learner_name, instructorName: notice.instructor_name ?? undefined },
    recipients: notice.recipients.map((one) => ({ userId: one.user_id, audience: one.audience, muted: muted?.get(one.user_id) })),
    linkFor: (audience) => learnerJoinedLink(notice, audience),
  });
}

/** Tells whoever invited a learner that they joined. Nothing once the invitation or the account is gone. */
export async function notifyLearnerJoined(invitationId: string): Promise<NotifyResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_learner_joined_notice', { p_invitation_id: invitationId });
  if (error) throw new Error(`Could not read who to tell about a learner joining: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as LearnerJoinedNotice;
  const muted = await mutedChannels(
    notice.recipients.map((one) => one.user_id),
    notificationCatalogue['learner.joined'].category,
  );
  return {
    written: await writeNotifications(
      notificationRows(planLearnerJoined(notice, muted), { businessId: notice.business_id, entityType: 'invitation', entityId: notice.invitation_id }),
    ),
  };
}
