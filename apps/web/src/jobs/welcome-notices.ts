import 'server-only';
import { planNotifications, type NotificationAudience, type PlannedNotification } from '@repo/core/notifications';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { writeNotifications, type NotifyResult } from './notify';

/** What `system_welcome_notice` answers. */
export interface WelcomeNotice {
  user_id: string;
  full_name: string;
  audience: NotificationAudience;
  /** The school they joined, and as what, when they are at one (D-400). */
  school?: { name: string; role: 'instructor' | 'manager' } | null;
}

/**
 * The welcome (NTF-03, NTF-06, D-259): once somebody's email is confirmed, in their inbox and by
 * email, saying what is next for the side they signed up for and where to ask for help. The button
 * goes to getting started, which knows whether that is onboarding or their portal. Once for each
 * person, however often the event arrives.
 */
export function planWelcome(notice: WelcomeNotice): PlannedNotification[] {
  return planNotifications({
    kind: 'account.welcome',
    entityId: notice.user_id,
    facts: notice.school ? { schoolName: notice.school.name, schoolRole: notice.school.role } : {},
    recipients: [{ userId: notice.user_id, audience: notice.audience }],
    linkFor: () => '/start',
  });
}

/** Welcomes somebody whose email was just confirmed. Nothing for an account that is not there. */
export async function notifyWelcome(userId: string): Promise<NotifyResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_welcome_notice', { p_user_id: userId });
  if (error) throw new Error(`Could not read who to welcome: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as WelcomeNotice;
  return {
    written: await writeNotifications(notificationRows(planWelcome(notice), { businessId: null, entityType: 'user', entityId: notice.user_id })),
  };
}
