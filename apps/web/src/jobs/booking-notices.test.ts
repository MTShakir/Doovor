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
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. A fee of £42 applies.');
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
