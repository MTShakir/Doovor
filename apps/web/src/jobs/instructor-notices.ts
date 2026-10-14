import 'server-only';
import {
  notificationCatalogue,
  planNotifications,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationRecipient,
  type PlannedNotification,
} from '@repo/core/notifications';
import { formatDate } from '@repo/core/time';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';

/** What `system_instructor_notice` answers. */
export interface InstructorNotice {
  instructor_profile_id: string;
  business_id: string;
  user_id: string;
  name: string;
  verification_status: string;
  reason: string | null;
  /** "2027-03-31", or null when no expiry was given. */
  badge_expiry: string | null;
  /** How many times the badge has been decided: each decision is its own notice. */
  decisions: number;
  /** The school's owners and managers, when the instructor teaches for one. */
  school_staff_ids: string[];
}

/** What the daily sweep says about a badge running out (INS-03). */
export interface BadgeExpiringEvent {
  instructor_profile_id: string;
  days_before: number;
  summary: string;
}

/** Where tapping it lands: the instructor's own profile, or the school's list of instructors. */
const linkFor = (audience: NotificationAudience): string => (audience === 'school' ? '/app/school/instructors' : '/app/instructor/profile');

/** The instructor, and the school's people when there is a school, each muted as they chose (NTF-04). */
function recipientsFor(notice: InstructorNotice, muted?: Map<string, NotificationChannel[]>): NotificationRecipient[] {
  return [
    { userId: notice.user_id, audience: 'instructor', muted: muted?.get(notice.user_id) },
    ...notice.school_staff_ids.map((userId) => ({ userId, audience: 'school' as const, muted: muted?.get(userId) })),
  ];
}

/**
 * A badge decided (INS-02, Appendix B, D-260): the instructor hears they are verified, or why not
 * and to send it again, and the school they teach for hears about them by name. One notice for each
 * decision, however often the event arrives.
 */
export function planVerificationDecided(notice: InstructorNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  return planNotifications({
    kind: 'verification.decided',
    entityId: notice.instructor_profile_id,
    version: notice.decisions,
    facts: { instructorName: notice.name, approved: notice.verification_status === 'approved', detail: notice.reason ?? undefined },
    recipients: recipientsFor(notice, muted),
    linkFor,
  });
}

/**
 * A badge running out (INS-03, Appendix B, D-260): at sixty, thirty and seven days, to the
 * instructor in the sweep's own words, and to their school with the day it runs out.
 */
export function planBadgeExpiring(
  notice: InstructorNotice,
  event: BadgeExpiringEvent,
  muted?: Map<string, NotificationChannel[]>,
): PlannedNotification[] {
  return planNotifications({
    kind: 'badge.expiring',
    entityId: notice.instructor_profile_id,
    // One for each warning about each badge: a renewed badge is warned about again.
    version: `${notice.badge_expiry ?? 'none'}:${String(event.days_before)}`,
    facts: {
      instructorName: notice.name,
      detail: event.summary,
      when: notice.badge_expiry === null ? undefined : formatDate(new Date(`${notice.badge_expiry}T12:00:00Z`)),
    },
    recipients: recipientsFor(notice, muted),
    linkFor,
  });
}

async function readNotice(profileId: string): Promise<InstructorNotice | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_instructor_notice', { p_instructor_profile_id: profileId });
  if (error) throw new Error(`Could not read the instructor to notify about: ${error.message}`);
  return data === null ? null : (data as unknown as InstructorNotice);
}

async function write(notice: InstructorNotice, planned: PlannedNotification[]): Promise<NotifyResult> {
  return {
    written: await writeNotifications(
      notificationRows(planned, { businessId: notice.business_id, entityType: 'instructor_profile', entityId: notice.instructor_profile_id }),
    ),
  };
}

const everybody = (notice: InstructorNotice): string[] => [notice.user_id, ...notice.school_staff_ids];

/** Tells an instructor, and their school, how their badge was decided. Nothing for a profile that is gone. */
export async function notifyVerificationDecided(profileId: string): Promise<NotifyResult> {
  const notice = await readNotice(profileId);
  if (notice === null) return { written: 0 };
  const muted = await mutedChannels(everybody(notice), notificationCatalogue['verification.decided'].category);
  return write(notice, planVerificationDecided(notice, muted));
}

/** Warns an instructor, and their school, that a badge is running out. */
export async function notifyBadgeExpiring(event: BadgeExpiringEvent): Promise<NotifyResult> {
  const notice = await readNotice(event.instructor_profile_id);
  if (notice === null) return { written: 0 };
  const muted = await mutedChannels(everybody(notice), notificationCatalogue['badge.expiring'].category);
  return write(notice, planBadgeExpiring(notice, event, muted));
}
