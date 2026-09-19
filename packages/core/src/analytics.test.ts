import { describe, expect, it } from 'vitest';
import { analyticsEvents, eventsAwaitingTheirFeature, outwardOf, type AnalyticsEvents } from './analytics.ts';

describe('what the product counts (PRD 16, M6-09)', () => {
  it('is the list the PRD gives, with nothing added or missing', () => {
    // Written out again here on purpose: the PRD is the source, and a name changed by accident in
    // one place should fail rather than quietly rename a metric.
    expect([...analyticsEvents]).toEqual([
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
    ]);
  });

  it('types every name in the list, and lists every name it types', () => {
    // The type is the contract; this is the proof that the list and the type say the same thing.
    const typed: Record<keyof AnalyticsEvents, true> = {
      signup_started: true,
      signup_completed: true,
      onboarding_step_completed: true,
      instructor_verified: true,
      stripe_connected: true,
      learner_added: true,
      invite_sent: true,
      invite_accepted: true,
      booking_created: true,
      booking_cancelled: true,
      lesson_completed: true,
      lesson_record_saved: true,
      payment_succeeded: true,
      package_purchased: true,
      gap_fill_offer_sent: true,
      gap_fill_filled: true,
      search_performed: true,
      profile_viewed: true,
      lesson_request_created: true,
      review_submitted: true,
      plan_upgraded: true,
    };
    expect(Object.keys(typed).sort()).toEqual([...analyticsEvents].sort());
  });

  it('says which ones are waiting on a feature that does not exist yet', () => {
    expect([...eventsAwaitingTheirFeature]).toEqual(['gap_fill_offer_sent', 'gap_fill_filled', 'review_submitted', 'plan_upgraded']);
    for (const event of eventsAwaitingTheirFeature) expect(analyticsEvents).toContain(event);
  });

  it('counts a district, never a doorstep', () => {
    expect(outwardOf('LS6 3QS')).toBe('LS6');
    expect(outwardOf('m1 2qf')).toBe('M1');
    expect(outwardOf('  EC1A  1BB ')).toBe('EC1A');
    expect(outwardOf('LS6')).toBe('LS6');
    expect(outwardOf('')).toBe('');
  });
});
