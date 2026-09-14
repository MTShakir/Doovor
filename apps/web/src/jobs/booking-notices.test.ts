import { describe, expect, it } from 'vitest';
import {
  kindForEvent,
  notificationRows,
  peopleInvolved,
  planBookingNotifications,
  rowContextFor,
  type BookingNotice,
} from './booking-notices';

const notice: BookingNotice = {
  booking_id: 'booking-1',
  business_id: 'business-1',
  status: 'confirmed',
  version: 3,
  // 09:00 London, in British Summer Time.
  starts_at: '2026-09-16T08:00:00+00:00',
  learner_user_id: 'learner-1',
  learner_name: 'Jack Taylor',
  instructor_user_id: 'instructor-1',
  instructor_name: 'Sarah Khan',
  school_user_ids: ['manager-1'],
};

describe('which notification an event comes to (NTF-03)', () => {
  it('tells apart a lesson booked from one asked for', () => {
    expect(kindForEvent({ name: 'booking.created', payload: { status: 'confirmed' } }, notice)).toBe(
      'booking.confirmed',
    );
    expect(kindForEvent({ name: 'booking.created', payload: { status: 'requested' } }, notice)).toBe(
      'booking.requested',
    );
  });

  it('falls back to what the lesson says when the event did not say', () => {
    expect(kindForEvent({ name: 'booking.created', payload: {} }, { ...notice, status: 'requested' })).toBe(
      'booking.requested',
    );
  });

  it('says nothing about a lesson waiting to be paid for, or one marked done that owes nothing', () => {
    expect(kindForEvent({ name: 'booking.created', payload: { status: 'pending_payment' } }, notice)).toBeNull();
    expect(kindForEvent({ name: 'booking.completed', payload: {} }, notice)).toBeNull();
  });
});

describe('what everybody is told about a lesson (PRD Appendix B)', () => {
  it('tells the learner, the instructor and the school when one is booked', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.created', payload: { status: 'confirmed' } },
      notice,
    });
    expect(planned.map((one) => one.userId)).toEqual(['learner-1', 'instructor-1', 'manager-1']);
    expect(planned[0]?.title).toBe('Lesson booked');
    // London time, not UTC: the lesson is at nine in the morning (R-14).
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan.');
    expect(planned[1]?.title).toBe('Jack Taylor has a lesson booked');
  });

  it('tells only the instructor about a request, and only the learner about the answer', () => {
    const asked = planBookingNotifications({
      event: { name: 'booking.created', payload: { status: 'requested' } },
      notice: { ...notice, status: 'requested' },
    });
    expect(asked.map((one) => one.userId)).toEqual(['instructor-1']);

    const answered = planBookingNotifications({ event: { name: 'booking.accepted', payload: {} }, notice });
    expect(answered.map((one) => one.userId)).toEqual(['learner-1']);
    expect(answered[0]?.body).toContain('It is in the diary');
  });

  it('says why a request was declined, when a reason was given', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.declined', payload: {} },
      notice: { ...notice, cancel_reason: 'Away that afternoon' },
    });
    expect(planned[0]?.body).toContain('Reason: Away that afternoon');
  });

  it('says what a late cancellation cost', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.cancelled', payload: {} },
      notice: { ...notice, late_cancellation: true, fee_pence: 4200 },
    });
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. A fee of £42 is owed.');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. Jack Taylor cancelled late, so a fee of £42 is owed.');
  });

  it('says the fee was kept from credit, not charged, for a lesson paid with credit (R-07)', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.cancelled', payload: { by: 'learner', late: true, fee_pence: 4200, credit_kept_minutes: 60, credit_returned_minutes: 0 } },
      notice: { ...notice, late_cancellation: true, fee_pence: 4200, payment_status: 'paid_credit' },
    });
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. 1 hour of your credit is kept as the fee.');
  });

  it('takes each of them to the screen that answers it', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.rescheduled', payload: {} },
      notice,
    });
    expect(planned.map((one) => one.link)).toEqual([
      '/app/learner/lessons',
      '/app/instructor/diary?view=day&date=2026-09-16',
      '/app/school/diary?date=2026-09-16',
    ]);
  });

  it('leaves out a channel somebody switched off, and keeps the inbox for a service message', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.cancelled', payload: {} },
      notice,
      muted: new Map([
        ['learner-1', ['email']],
        ['manager-1', ['in_app', 'push', 'email']],
      ]),
    });
    expect(planned[0]?.channels).toEqual(['in_app', 'push']);
    // Cancelled is a service message, so it still reaches the manager's inbox (NFR-PRV-05).
    expect(planned[2]?.channels).toEqual(['in_app']);
  });

  it('asks about everybody once, however many hats they wear', () => {
    expect(peopleInvolved({ ...notice, school_user_ids: ['instructor-1', 'manager-1'] })).toEqual([
      'learner-1',
      'instructor-1',
      'manager-1',
    ]);
  });

  it('writes rows the database can take, with a key per person and version', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.rescheduled', payload: {} },
      notice,
    });
    const rows = notificationRows(planned, rowContextFor(notice));
    expect(rows[0]).toMatchObject({
      user_id: 'learner-1',
      business_id: 'business-1',
      kind: 'booking.rescheduled',
      category: 'bookings',
      entity_type: 'booking',
      entity_id: 'booking-1',
      dedupe_key: 'booking.rescheduled:booking-1:3:learner-1',
    });
    expect(rows).toHaveLength(3);
  });
});

describe('a lesson that could not be charged the day before (PAY-03, M3-09)', () => {
  const failed = (reason: string) => ({ name: 'payment.charge_failed', payload: { booking_id: 'booking-1', reason } });

  it('tells the learner, the instructor and the school, and sends the learner to pay', () => {
    const planned = planBookingNotifications({ event: failed('declined'), notice });

    expect(planned.map((one) => one.userId)).toEqual(['learner-1', 'instructor-1', 'manager-1']);
    expect(planned[0]?.title).toBe('A payment did not go through');
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. The card was refused. Pay now to keep the lesson.');
    expect(planned[0]?.link).toBe('/app/learner/pay/booking-1');
    expect(planned[1]?.title).toBe('A payment from Jack Taylor did not go through');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. The card was refused.');
    expect(planned[1]?.link).toBe('/app/instructor/diary?view=day&date=2026-09-16');
  });

  it('says why in words, whatever the reason', () => {
    const body = (reason: string) => planBookingNotifications({ event: failed(reason), notice })[1]?.body;

    expect(body('no_card')).toContain('There was no card saved to charge.');
    expect(body('expired_card')).toContain('The saved card has run out.');
    expect(body('authentication_required')).toContain('The bank wants the card holder to confirm the payment.');
    expect(body('something_new')).toContain('The card could not be charged.');
  });

  it('says nothing about a card refused on screen, which the screen already said', () => {
    expect(kindForEvent({ name: 'payment.failed', payload: { booking_id: 'booking-1' } }, notice)).toBeNull();
  });
});

describe('asking to be paid when a lesson is marked done (PAY-03, M3-10)', () => {
  const done = { name: 'booking.completed', payload: { booking_id: 'booking-1' } };
  const owed = { ...notice, status: 'completed', payment_mode: 'after_lesson', payment_status: 'unpaid', price_pence: 4200 };

  it('sends the learner, and only the learner, straight to paying for it', () => {
    const planned = planBookingNotifications({ event: done, notice: owed });

    expect(planned.map((one) => one.userId)).toEqual(['learner-1']);
    expect(planned[0]?.kind).toBe('payment.requested');
    expect(planned[0]?.title).toBe('Pay for your lesson');
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. £42 is due now.');
    expect(planned[0]?.link).toBe('/app/learner/pay/booking-1');
  });

  it('asks nothing of a lesson paid for another way, or already paid', () => {
    expect(planBookingNotifications({ event: done, notice: { ...owed, payment_mode: 'at_booking' } })).toEqual([]);
    expect(planBookingNotifications({ event: done, notice: { ...owed, payment_status: 'paid_cash' } })).toEqual([]);
  });
});

describe('the email about a cancelled lesson (PAY-09, R-06, R-08, M3-18)', () => {
  const cancelled = { ...notice, status: 'cancelled', version: 4 };
  const event = (payload: Record<string, unknown>) => ({
    name: 'booking.cancelled',
    payload: {
      booking_id: 'booking-1',
      fee_pence: 0,
      kept_pence: 0,
      card_refund_pence: 0,
      offline_refund_pence: 0,
      credit_returned_minutes: 0,
      credit_kept_minutes: 0,
      window_hours: 48,
      fee_percent: 100,
      ...payload,
    },
  });

  it('acceptance-04: emails the learner who cancelled a card lesson a day before, saying why the whole fee was kept', () => {
    const planned = planBookingNotifications({
      event: event({ by: 'learner', late: true, fee_pence: 4200, kept_pence: 4200, minutes_before: 1440 }),
      notice: { ...cancelled, late_cancellation: true, fee_pence: 4200, payment_status: 'paid_card' },
    });

    const learner = planned[0];
    expect(learner?.userId).toBe('learner-1');
    expect(learner?.channels).toContain('email');
    expect(learner?.title).toBe('Lesson cancelled');
    expect(learner?.body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. You cancelled 24 hours before it started. Cancelling less than 48 hours before a lesson costs the full price, so the £42 you paid is kept as the fee.',
    );
    // The instructor and the school are told what happened, not lectured on the policy.
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. Jack Taylor cancelled late, so the £42 they paid is kept as the fee.');
  });

  it('acceptance-05: tells the learner an instructor cancelled on why, and that it all goes back to their card', () => {
    const planned = planBookingNotifications({
      event: event({ by: 'instructor', late: true, card_refund_pence: 4200, minutes_before: 180 }),
      notice: { ...cancelled, late_cancellation: true, cancel_reason: 'Car in for repair', payment_status: 'paid_card' },
    });

    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. Reason: Car in for repair. £42 is going back to your card.');
    expect(planned[2]?.body).toBe("Wed 16 Sep at 09:00 with Sarah Khan. Reason: Car in for repair. £42 is going back to Jack Taylor's card.");
  });

  it('tells the instructor when cash has to be handed back', () => {
    const planned = planBookingNotifications({
      event: event({ by: 'business', offline_refund_pence: 4200 }),
      notice: { ...cancelled, cancel_reason: 'School closed that day.', payment_status: 'paid_cash' },
    });

    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. Reason: School closed that day. You are owed back the £42 you paid.');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. Reason: School closed that day. Jack Taylor is owed back the £42 they paid.');
  });

  it('tells a learner who cancelled in time there is no charge', () => {
    const planned = planBookingNotifications({ event: event({ by: 'learner', late: false, minutes_before: 5000 }), notice: cancelled });

    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. There is no charge.');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor.');
  });
});

describe('a lesson nobody came to, and a fee charged to the kept card (PAY-09, R-09, M3-19)', () => {
  const missed = { ...notice, status: 'no_show', version: 5, late_cancellation: true, fee_pence: 4200 };
  const noShow = (payload: Record<string, unknown>) => ({
    name: 'booking.no_show',
    payload: {
      booking_id: 'booking-1',
      fee_pence: 4200,
      fee_percent: 100,
      kept_pence: 0,
      card_refund_pence: 0,
      offline_refund_pence: 0,
      credit_returned_minutes: 0,
      credit_kept_minutes: 0,
      charging: false,
      ...payload,
    },
  });

  it('tells the learner, the instructor and the school, and the learner why a fee is kept', () => {
    const planned = planBookingNotifications({ event: noShow({ kept_pence: 4200 }), notice: { ...missed, payment_status: 'paid_card' } });

    expect(planned.map((one) => [one.userId, one.kind])).toEqual([
      ['learner-1', 'booking.no_show'],
      ['instructor-1', 'booking.no_show'],
      ['manager-1', 'booking.no_show'],
    ]);
    expect(planned[0]?.title).toBe('Marked as a no-show');
    expect(planned[0]?.channels).toContain('email');
    expect(planned[0]?.body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. Missing a lesson costs the full price, as cancelling late does, so the £42 you paid is kept as the fee.',
    );
    expect(planned[1]?.title).toBe('Jack Taylor did not turn up');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. The £42 they paid is kept as the fee.');
  });

  it('says a fee nothing paid is being charged to the saved card', () => {
    const planned = planBookingNotifications({ event: noShow({ charging: true }), notice: missed });
    expect(planned[0]?.body).toContain('so the £42 fee is being charged to your saved card.');
  });

  it('says so for a late cancellation too', () => {
    const planned = planBookingNotifications({
      event: {
        name: 'booking.cancelled',
        payload: { by: 'learner', late: true, fee_pence: 4200, kept_pence: 0, charging: true, window_hours: 48, fee_percent: 100, minutes_before: 600 },
      },
      notice: { ...notice, status: 'cancelled', late_cancellation: true, fee_pence: 4200 },
    });
    expect(planned[0]?.body).toContain('so the £42 fee is being charged to your saved card.');
  });

  it('asks the learner to pay a fee the card would not pay, without telling them to keep a lesson', () => {
    const failed = { name: 'payment.charge_failed', payload: { booking_id: 'booking-1', reason: 'declined', fee: true } };
    const planned = planBookingNotifications({ event: failed, notice: { ...missed, payment_status: 'failed' } });

    expect(planned[0]?.title).toBe('A payment did not go through');
    expect(planned[0]?.body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. The £42 no-show fee could not be charged to your saved card. The card was refused. Pay it now.',
    );
    expect(planned[0]?.link).toBe('/app/learner/pay/booking-1');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. The £42 no-show fee could not be charged. The card was refused.');

    const late = planBookingNotifications({ event: failed, notice: { ...missed, status: 'cancelled' } });
    expect(late[1]?.body).toContain('The £42 late cancellation fee could not be charged.');
  });
});

describe('disputing a no-show (R-09, M3-19)', () => {
  const missed = { ...notice, status: 'no_show', version: 6, late_cancellation: true, fee_pence: 4200 };

  it('tells the learner until when they can dispute a no-show', () => {
    const planned = planBookingNotifications({
      event: { name: 'booking.no_show', payload: { booking_id: 'booking-1', fee_pence: 4200, fee_percent: 100, dispute_until: '2026-09-23T08:20:00Z' } },
      notice: missed,
    });
    expect(planned[0]?.body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. Missing a lesson costs the full price, as cancelling late does, so a fee of £42 is owed. If that is wrong, you can dispute it from your lessons until Wed 23 Sep.',
    );
  });

  it('tells the instructor and the school, and takes them where it is decided', () => {
    const planned = planBookingNotifications({ event: { name: 'booking.disputed', payload: { booking_id: 'booking-1', dispute_id: 'dispute-1' } }, notice: missed });

    expect(planned.map((one) => [one.userId, one.title])).toEqual([
      ['instructor-1', 'Jack Taylor disputed a no-show'],
      ['manager-1', 'Jack Taylor disputed a no-show'],
    ]);
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. Decide whether the fee stands.');
    expect(planned.map((one) => one.link)).toEqual(['/app/instructor/learners/learner-1', '/app/school/learners']);
  });

  it('tells the learner how it was decided, and what came back', () => {
    const decided = (payload: Record<string, unknown>) =>
      planBookingNotifications({ event: { name: 'booking.dispute_decided', payload: { booking_id: 'booking-1', fee_pence: 4200, ...payload } }, notice: missed });

    const waived = decided({ outcome: 'waived', card_refund_pence: 4200 });
    expect(waived.map((one) => one.userId)).toEqual(['learner-1']);
    expect(waived[0]?.title).toBe('Your no-show dispute was answered');
    expect(waived[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. The £42 fee is waived. £42 is going back to your card.');
    expect(decided({ outcome: 'kept' })[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. The fee stands.');
  });
});
