import 'server-only';
import {
  notificationCatalogue,
  offeredPupilLine,
  planNotifications,
  type NotificationAudience,
  type NotificationChannel,
  type NotificationFacts,
  type PlannedNotification,
  type SchoolNoticeOutcome,
} from '@repo/core/notifications';
import { feeInWords, feeTermsInOneLine, firstFeeOn, type FeePeriod } from '@repo/core/school-fees';
import { formatCalendarDate, formatDate, formatTime } from '@repo/core/time';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { notificationRows } from './booking-notices';
import { mutedChannels, writeNotifications, type NotifyResult } from './notify';

/** The changes the database queues a notice about (M9-28, D-295). */
export const schoolNoticeEvents = [
  'pupil.offered',
  'pupil.taken',
  'school_fee.terms_set',
  'school_fee.due',
  'school_fee.settled',
  'learner.move_asked',
  'school.link_ended',
  'school.member_left',
] as const;
export type SchoolNoticeEvent = (typeof schoolNoticeEvents)[number];

export function isSchoolNoticeEvent(value: string): value is SchoolNoticeEvent {
  return (schoolNoticeEvents as readonly string[]).includes(value);
}

/** What `system_school_notice` answers: who hears, and the facts as the database keeps them. */
export interface SchoolNotice {
  kind: 'pupil.offered' | 'pupil.taken' | 'school_fee.terms_set' | 'school_fee.due' | 'school_fee.settled' | 'learner.move_asked' | 'school.left';
  business_id: string | null;
  entity_type: string;
  entity_id: string;
  version: string | null;
  recipients: { user_id: string; audience: NotificationAudience }[];
  school_name?: string | null;
  learner_name?: string | null;
  instructor_name?: string | null;
  business_name?: string | null;
  outcome?: SchoolNoticeOutcome | null;
  /** A pupil offered: the postcode district, the gearbox, and when the offer runs out. */
  area?: string | null;
  transmission?: 'manual' | 'automatic' | null;
  expires_at?: string | null;
  terms?: {
    period: FeePeriod | null;
    fee_pence: number | null;
    fees_start_on: string | null;
    free_weeks: number;
    pupil_fee_pence: number | null;
  } | null;
  fee?: {
    kind: 'period' | 'pupil';
    amount_pence: number;
    period_starts_on: string | null;
    period_ends_on: string | null;
    learner_name: string | null;
  } | null;
}

const given = (value: string | null | undefined): string | undefined => (value === null || value === undefined || value.trim() === '' ? undefined : value);

/** The facts the words are made from, written out here with packages/core's own helpers. */
export function factsFor(notice: SchoolNotice): NotificationFacts {
  const facts: NotificationFacts = {
    schoolName: given(notice.school_name),
    learnerName: given(notice.learner_name),
    instructorName: given(notice.instructor_name),
    businessName: given(notice.business_name),
    outcome: notice.outcome ?? undefined,
  };

  if (notice.kind === 'pupil.offered') {
    const expires = given(notice.expires_at) === undefined ? null : new Date(notice.expires_at ?? '');
    return {
      ...facts,
      detail: offeredPupilLine({ firstName: given(notice.learner_name) ?? 'A pupil', area: given(notice.area) ?? null, transmission: notice.transmission ?? null }),
      when: expires === null ? undefined : `${formatDate(expires)} at ${formatTime(expires)}`,
    };
  }

  if (notice.kind === 'school_fee.terms_set' && notice.terms) {
    const terms = notice.terms;
    const first = terms.fees_start_on === null ? null : formatCalendarDate(firstFeeOn(terms.fees_start_on, terms.free_weeks), { year: false });
    return {
      ...facts,
      detail: feeTermsInOneLine(
        { period: terms.period, feePence: terms.fee_pence, startsOn: terms.fees_start_on, freeWeeks: terms.free_weeks, pupilFeePence: terms.pupil_fee_pence },
        first,
      ),
    };
  }

  if ((notice.kind === 'school_fee.due' || notice.kind === 'school_fee.settled') && notice.fee) {
    const fee = notice.fee;
    return {
      ...facts,
      detail: feeInWords({
        kind: fee.kind,
        amountPence: fee.amount_pence,
        periodStartsOn: fee.period_starts_on,
        periodEndsOn: fee.period_ends_on,
        learnerName: fee.learner_name,
      }),
    };
  }

  return facts;
}

/** Where tapping it lands, for whoever reads it. */
export function schoolNoticeLink(notice: SchoolNotice, audience: NotificationAudience): string {
  switch (notice.kind) {
    case 'pupil.taken':
      return '/app/school/pupils';
    case 'learner.move_asked':
      return '/app/learner';
    case 'school.left':
      if (audience === 'school') return '/app/school/instructors';
      if (notice.outcome !== 'switched_off') return '/app/instructor';
      // Their own Business to open again, or wherever getting started takes them now.
      return given(notice.business_name) === undefined ? '/start' : '/paused';
    default:
      // An offer and the fees are answered and read on the instructor's page about their school.
      return '/app/instructor/school';
  }
}

/**
 * A school's own arrangements (M9-28, D-295): a pupil offered and taken, a linked instructor's
 * fees, a learner asked whether to move, and an instructor and a school parting. One notice for
 * each change, however often the event arrives.
 */
export function planSchoolNotice(notice: SchoolNotice, muted?: Map<string, NotificationChannel[]>): PlannedNotification[] {
  return planNotifications({
    kind: notice.kind,
    entityId: notice.entity_id,
    version: notice.version ?? undefined,
    facts: factsFor(notice),
    recipients: notice.recipients.map((one) => ({ userId: one.user_id, audience: one.audience, muted: muted?.get(one.user_id) })),
    linkFor: (audience) => schoolNoticeLink(notice, audience),
  });
}

/** Tells whoever a change at a school concerns. Nothing for a change that has moved on since. */
export async function notifySchoolNotice(event: { kind: string; id: string }): Promise<NotifyResult> {
  if (!isSchoolNoticeEvent(event.kind)) return { written: 0 };
  const { data, error } = await getSupabaseServiceClient().rpc('system_school_notice', { p_kind: event.kind, p_id: event.id });
  if (error) throw new Error(`Could not read what to tell about a school: ${error.message}`);
  if (data === null) return { written: 0 };

  const notice = data as unknown as SchoolNotice;
  const muted = await mutedChannels(
    notice.recipients.map((one) => one.user_id),
    notificationCatalogue[notice.kind].category,
  );
  const planned = planSchoolNotice(notice, muted);
  return {
    written: await writeNotifications(
      notificationRows(planned, { businessId: notice.business_id, entityType: notice.entity_type, entityId: notice.entity_id }),
    ),
  };
}
