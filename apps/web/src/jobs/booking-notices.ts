/**
 * Turning something that happened to a lesson into the notifications it comes to (NTF-03,
 * M2-27).
 *
 * The outbox says what changed and who it was about; this decides what each person is told.
 * It holds no database or job-runner code so the mapping is testable on its own, the way
 * `dispatch.ts` is; `notify.ts` wires it to the real ones.
 */

import { formatPence } from '@repo/core/money';
import {
  planNotifications,
  type NotificationChannel,
  type NotificationKind,
  type PlannedNotification,
} from '@repo/core/notifications';
import { formatDate, formatTime, utcToLocal } from '@repo/core/time';

/** What `system_booking_notice` answers. */
export interface BookingNotice {
  booking_id: string;
  business_id: string;
  status: string;
  version: number;
  starts_at: string;
  learner_user_id: string;
  learner_name: string;
  instructor_user_id: string;
  instructor_name: string;
  school_user_ids: string[];
  fee_pence?: number | null;
  late_cancellation?: boolean;
  cancel_reason?: string | null;
}

export interface BookingEvent {
  name: string;
  payload: Record<string, unknown>;
}

/**
 * Which notification an event comes to, if any. A lesson marked done is not news to anybody
 * until the lesson record is written (M4-12), so it comes to nothing here.
 */
export function kindForEvent(event: BookingEvent, notice: BookingNotice): NotificationKind | null {
  switch (event.name) {
    case 'booking.created': {
      const status = typeof event.payload.status === 'string' ? event.payload.status : notice.status;
      if (status === 'requested') return 'booking.requested';
      return status === 'confirmed' ? 'booking.confirmed' : null;
    }
    case 'booking.accepted':
    case 'booking.declined':
      return 'booking.answered';
    case 'booking.cancelled':
      return 'booking.cancelled';
    case 'booking.rescheduled':
      return 'booking.rescheduled';
    default:
      return null;
  }
}

/** The line under the title, when there is more to say than when the lesson is. */
function detailFor(event: BookingEvent, notice: BookingNotice): string | undefined {
  const reason = notice.cancel_reason?.trim();
  if (event.name === 'booking.accepted') return 'It is in the diary';
  if (event.name === 'booking.declined') return reason ? `Reason: ${reason}` : 'They could not make that time';
  if (event.name === 'booking.cancelled') {
    const fee = notice.fee_pence ?? 0;
    if (reason) return `Reason: ${reason}`;
    return notice.late_cancellation && fee > 0 ? `A fee of ${formatPence(fee)} applies` : undefined;
  }
  return undefined;
}

/** Where each of them goes when they tap it. */
function linkFor(notice: BookingNotice): (audience: 'learner' | 'instructor' | 'school') => string {
  const day = utcToLocal(new Date(notice.starts_at)).date;
  return (audience) => {
    if (audience === 'learner') return '/app/learner/lessons';
    if (audience === 'school') return `/app/school/diary?date=${day}`;
    return `/app/instructor/diary?view=day&date=${day}`;
  };
}

export interface BookingNoticeInput {
  event: BookingEvent;
  notice: BookingNotice;
  /** What each person has switched off for the category this kind belongs to (NTF-04). */
  muted?: Map<string, NotificationChannel[]>;
}

/** Everyone who hears about one change to one lesson, and what each of them is told. */
export function planBookingNotifications(input: BookingNoticeInput): PlannedNotification[] {
  const { event, notice } = input;
  const kind = kindForEvent(event, notice);
  if (kind === null) return [];

  const muted = input.muted ?? new Map<string, NotificationChannel[]>();
  const startsAt = new Date(notice.starts_at);

  return planNotifications({
    kind,
    entityId: notice.booking_id,
    version: notice.version,
    facts: {
      learnerName: notice.learner_name,
      instructorName: notice.instructor_name,
      when: `${formatDate(startsAt)} at ${formatTime(startsAt)}`,
      detail: detailFor(event, notice),
    },
    recipients: [
      { userId: notice.learner_user_id, audience: 'learner', muted: muted.get(notice.learner_user_id) },
      { userId: notice.instructor_user_id, audience: 'instructor', muted: muted.get(notice.instructor_user_id) },
      ...notice.school_user_ids.map((userId) => ({
        userId,
        audience: 'school' as const,
        muted: muted.get(userId),
      })),
    ],
    linkFor: linkFor(notice),
  });
}

/** Everybody one event might reach, so their settings can be looked up in one go. */
export function peopleInvolved(notice: BookingNotice): string[] {
  return [...new Set([notice.learner_user_id, notice.instructor_user_id, ...notice.school_user_ids])];
}

/** One row as `system_notify` takes it: plain JSON, because that is what crosses the wire. */
export type NotificationRow = Record<string, string | string[] | null>;

export interface RowContext {
  businessId: string;
  /** What it is about: a booking today, a payment later. */
  entityType: string;
  entityId: string;
}

/** The shape `system_notify` takes. */
export function notificationRows(planned: PlannedNotification[], context: RowContext): NotificationRow[] {
  return planned.map((one) => ({
    user_id: one.userId,
    business_id: context.businessId,
    kind: one.kind,
    category: one.category,
    title: one.title,
    body: one.body,
    link: one.link,
    channels: one.channels,
    entity_type: context.entityType,
    entity_id: context.entityId,
    dedupe_key: one.dedupeKey,
  }));
}

/** The context for one lesson's notifications. */
export function rowContextFor(notice: BookingNotice): RowContext {
  return { businessId: notice.business_id, entityType: 'booking', entityId: notice.booking_id };
}
