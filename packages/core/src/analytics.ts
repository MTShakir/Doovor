/**
 * Everything the product counts (PRD 16, M6-09).
 *
 * One list, typed, so a name cannot be misspelt into a metric nobody notices and a property cannot
 * be forgotten. Nothing here is personal: a name, an email address or a postcode never goes in a
 * property. An outward code such as "LS6" does, because it is a district and not a doorstep.
 *
 * Counting only happens for somebody who has said yes (NFR-PRV-02, D-144).
 */

/** How somebody came to be booking. */
export type BookingSource = 'instructor' | 'self' | 'marketplace' | 'gap_fill';

/** How a learner came to be on a Business's books. */
export type LearnerMethod = 'by_hand' | 'invite' | 'import' | 'marketplace';

/** How a lesson was paid for. */
export type PaymentMethod = 'card' | 'saved_card' | 'credit' | 'cash' | 'bank_transfer';

export interface AnalyticsEvents {
  signup_started: { role: 'learner' | 'instructor' | 'school' };
  signup_completed: { role: 'learner' | 'instructor' | 'school' };
  onboarding_step_completed: { step: string };
  instructor_verified: Record<string, never>;
  stripe_connected: Record<string, never>;
  learner_added: { method: LearnerMethod; count?: number };
  invite_sent: { to: 'learner' | 'instructor' };
  invite_accepted: { as: 'learner' | 'instructor' };
  booking_created: { source: BookingSource; recurring: boolean };
  booking_cancelled: { by: 'learner' | 'instructor'; late: boolean };
  lesson_completed: Record<string, never>;
  lesson_record_saved: { seconds: number };
  payment_succeeded: { method: PaymentMethod };
  package_purchased: { hours: number };
  gap_fill_offer_sent: { offered_to: number };
  gap_fill_filled: Record<string, never>;
  search_performed: { outward: string; results: number };
  profile_viewed: { kind: 'instructor' | 'school' };
  lesson_request_created: Record<string, never>;
  review_submitted: { stars: number };
  plan_upgraded: { plan: string };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

/** The whole list, in the order PRD section 16 gives it, for the test that holds them together. */
export const analyticsEvents: readonly AnalyticsEvent[] = [
  'signup_started',
  'signup_completed',
  'onboarding_step_completed',
  'instructor_verified',
  'stripe_connected',
  'learner_added',
  'invite_sent',
  'invite_accepted',
  'booking_created',
  'booking_cancelled',
  'lesson_completed',
  'lesson_record_saved',
  'payment_succeeded',
  'package_purchased',
  'gap_fill_offer_sent',
  'gap_fill_filled',
  'search_performed',
  'profile_viewed',
  'lesson_request_created',
  'review_submitted',
  'plan_upgraded',
];

/**
 * The ones whose feature does not exist yet, so nothing sends them in Phase 1. They are named here
 * rather than left out, so the list stays the PRD's list and the gap is visible.
 */
export const eventsAwaitingTheirFeature: readonly AnalyticsEvent[] = [
  'gap_fill_offer_sent',
  'gap_fill_filled',
  'review_submitted',
  'plan_upgraded',
];

/** The outward code of a postcode, which is a district: "LS6 3QS" gives "LS6". */
export function outwardOf(postcode: string): string {
  return postcode.trim().toUpperCase().split(/\s+/)[0] ?? '';
}
