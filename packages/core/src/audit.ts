/**
 * The audit log in words (ADM-07, NFR-SEC-06): what each recorded action was, and the kinds staff
 * filter by. Every action the database records has words here; a test in packages/db reads the
 * migrations to keep it so.
 */

export const auditCategoryKeys = [
  'sign_in',
  'roles',
  'verification',
  'refunds',
  'payouts',
  'export',
  'deletion',
  'viewing',
  'platform',
  'housekeeping',
  'bookings',
  'businesses',
] as const;

export type AuditCategoryKey = (typeof auditCategoryKeys)[number];

export interface AuditCategory {
  key: AuditCategoryKey;
  label: string;
  /** The kind NFR-SEC-06 names, where it is one of them. */
  required: boolean;
  actions: readonly string[];
}

/** Each action, as a person would say what happened. */
export const auditActionWords: Readonly<Record<string, string>> = {
  'auth.sign_in': 'Signed in',
  'auth.session_revoked': 'Signed a device out',
  'membership.created': 'Joined a Business',
  'membership.deleted': 'Left a Business',
  'membership.role_changed': 'Role or standing at a Business changed',
  'member.invited': 'Invited to work for a Business',
  'member.invitation_accepted': 'Accepted an invitation to work for a Business',
  'member.invitation_revoked': 'Invitation to work for a Business cancelled',
  'staff.added': 'Made platform staff',
  'staff.removed': 'Removed from the platform staff',
  'staff.role_changed': 'Platform staff role changed',
  'instructor.verification_submitted': 'Badge sent in to be checked',
  'instructor.verification_decided': 'Badge approved or refused',
  'instructor.unlisted_badge_expired': 'Badge ran out',
  'refund.requested': 'Refund asked for',
  'refund.issued': 'Refund issued',
  'refund.settled': 'Refund settled',
  'refund.failed': 'Refund failed',
  'refund.recorded': 'Refund recorded as paid in person',
  'refund.handed_back': 'Credit handed back instead of a refund',
  'business.payments_connected': 'Payments account connected',
  'business.payment_mode_changed': 'When learners pay changed',
  'payment.received': 'Card payment received',
  'payment.authorised': 'Card payment authorised',
  'payment.capture_failed': 'Card payment could not be taken',
  'payment.charge_failed': 'Card charge failed',
  'payment.recorded': 'Payment recorded as paid in person',
  'payment.undone': 'Payment in person undone',
  'receipt.issued': 'Receipt issued',
  'credit.purchased': 'Package bought',
  'account.data_exported': 'Personal data exported',
  'account.deletion_requested': 'Account deletion asked for',
  'account.deletion_cancelled': 'Account deletion called off',
  'account.deleted': 'Account deleted',
  'audit_log.pruned': 'Audit entries over two years old removed',
  'impersonation.started': 'Staff started viewing as them',
  'impersonation.ended': 'Staff stopped viewing as them',
  'account.suspended': 'Account suspended',
  'account.reactivated': 'Account reactivated',
  'account.two_step_reset': 'Two-step verification reset',
  'business.suspended': 'Business suspended',
  'business.reactivated': 'Business reactivated',
  'platform.setting_changed': 'Platform setting changed',
  'region.marketplace_opened': 'Marketplace opened in an area',
  'region.marketplace_closed': 'Marketplace closed in an area',
  'booking.created': 'Lesson booked',
  'booking.accepted': 'Lesson request accepted',
  'booking.declined': 'Lesson request declined',
  'booking.cancelled': 'Lesson cancelled',
  'booking.rescheduled': 'Lesson moved',
  'booking.completed': 'Lesson marked done',
  'booking.no_show': 'Lesson marked as a no-show',
  'booking.hold_expired': 'Unpaid hold on a lesson lapsed',
  'booking.repeated': 'Lessons repeated weekly',
  'booking.repeat_stopped': 'Weekly lessons stopped',
  'lesson_record.saved': 'Lesson record saved',
  'no_show.disputed': 'No-show disputed',
  'no_show.dispute_decided': 'No-show dispute decided',
  'business.created': 'Business started',
  'business.prices_set': 'Prices set',
  'business.booking_rules_changed': 'Booking rules changed',
  'catalogue.prices_changed': 'Prices or packages changed',
  'instructor.hours_set': 'Working hours set',
  'instructor.own_prices_removed': 'Own prices removed',
  'instructor.supervision_changed': 'Trainee supervision changed',
  'learner.added': 'Learner added',
  'learner.invited': 'Learner invited',
  'learner.invitation_accepted': 'Learner accepted an invitation',
  'learner.reassigned': 'Learner given to another instructor',
  'learner.status_changed': 'Learner status changed',
};

/** The kinds of action staff filter by, the ones NFR-SEC-06 names first. */
export const auditCategories: readonly AuditCategory[] = [
  { key: 'sign_in', label: 'Sign-ins', required: true, actions: ['auth.sign_in', 'auth.session_revoked'] },
  {
    key: 'roles',
    label: 'Role changes',
    required: true,
    actions: [
      'membership.created',
      'membership.deleted',
      'membership.role_changed',
      'member.invited',
      'member.invitation_accepted',
      'member.invitation_revoked',
      'staff.added',
      'staff.removed',
      'staff.role_changed',
    ],
  },
  {
    key: 'verification',
    label: 'Verification decisions',
    required: true,
    actions: ['instructor.verification_submitted', 'instructor.verification_decided', 'instructor.unlisted_badge_expired'],
  },
  {
    key: 'refunds',
    label: 'Refunds',
    required: true,
    actions: ['refund.requested', 'refund.issued', 'refund.settled', 'refund.failed', 'refund.recorded', 'refund.handed_back'],
  },
  {
    key: 'payouts',
    label: 'Payout and payment changes',
    required: true,
    actions: [
      'business.payments_connected',
      'business.payment_mode_changed',
      'payment.received',
      'payment.authorised',
      'payment.capture_failed',
      'payment.charge_failed',
      'payment.recorded',
      'payment.undone',
      'receipt.issued',
      'credit.purchased',
    ],
  },
  { key: 'export', label: 'Data exports', required: true, actions: ['account.data_exported'] },
  { key: 'deletion', label: 'Account deletions', required: true, actions: ['account.deletion_requested', 'account.deletion_cancelled', 'account.deleted'] },
  { key: 'viewing', label: 'Viewing as somebody', required: true, actions: ['impersonation.started', 'impersonation.ended'] },
  {
    key: 'platform',
    label: 'Platform staff decisions',
    required: false,
    actions: [
      'account.suspended',
      'account.reactivated',
      'account.two_step_reset',
      'business.suspended',
      'business.reactivated',
      'platform.setting_changed',
      'region.marketplace_opened',
      'region.marketplace_closed',
    ],
  },
  // What the nightly sweep does on its own, so it is never mistaken for a person's doing (D-158).
  { key: 'housekeeping', label: 'Housekeeping', required: false, actions: ['audit_log.pruned'] },
  {
    key: 'bookings',
    label: 'Lessons',
    required: false,
    actions: [
      'booking.created',
      'booking.accepted',
      'booking.declined',
      'booking.cancelled',
      'booking.rescheduled',
      'booking.completed',
      'booking.no_show',
      'booking.hold_expired',
      'booking.repeated',
      'booking.repeat_stopped',
      'lesson_record.saved',
      'no_show.disputed',
      'no_show.dispute_decided',
    ],
  },
  {
    key: 'businesses',
    label: 'Businesses and learners',
    required: false,
    actions: [
      'business.created',
      'business.prices_set',
      'business.booking_rules_changed',
      'catalogue.prices_changed',
      'instructor.hours_set',
      'instructor.own_prices_removed',
      'instructor.supervision_changed',
      'learner.added',
      'learner.invited',
      'learner.invitation_accepted',
      'learner.reassigned',
      'learner.status_changed',
    ],
  },
];

/** "Refund issued", or the action as recorded for one this list does not know yet. */
export function auditWords(action: string): string {
  return auditActionWords[action] ?? action;
}

/** The actions of a kind, or null for any kind at all. */
export function auditCategoryActions(key: string | null | undefined): readonly string[] | null {
  if (!key) return null;
  return auditCategories.find((category) => category.key === key)?.actions ?? null;
}
