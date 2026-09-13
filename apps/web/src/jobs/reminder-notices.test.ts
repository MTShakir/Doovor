import { describe, expect, it } from 'vitest';
import { peopleToRemind, planReminders, reminderRows, type ReminderNotice } from './reminder-notices';

/** 09:00 London, in British Summer Time. */
const lesson = new Date('2026-09-16T08:00:00Z');
const before = (hours: number): Date => new Date(lesson.getTime() - hours * 3_600_000);

const notice: ReminderNotice = {
  booking_id: 'booking-1',
  business_id: 'business-1',
  business_plan: 'pro',
  reminder_settings: {},
  version: 2,
  starts_at: lesson.toISOString(),
  created_at: before(72).toISOString(),
  learner_user_id: 'learner-1',
  learner_name: 'Jack Taylor',
  learner_phone: '+447700900011',
  instructor_user_id: 'instructor-1',
  instructor_name: 'Sarah Khan',
};

const pro = () => true;

describe('reminders before a lesson (NTF-02)', () => {
  it('reminds the learner the day before, in words they would use', () => {
    const [first] = planReminders({ notices: [notice], now: before(24), textingAllowed: pro });

    expect(first?.hoursBefore).toBe(24);
    expect(first?.planned[0]?.userId).toBe('learner-1');
    expect(first?.planned[0]?.title).toBe('Lesson tomorrow');
    expect(first?.planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan.');
    expect(first?.planned[0]?.link).toBe('/app/learner/lessons');
  });

  it('reminds nobody but the learner', () => {
    const reminders = planReminders({ notices: [notice], now: before(2), textingAllowed: pro });
    const everybody = reminders.flatMap((one) => one.planned.map((row) => row.userId));
    expect(everybody).toEqual(['learner-1', 'learner-1']);
  });

  it('sends each reminder once, however often the job runs', () => {
    const keys = (now: Date): string[] =>
      planReminders({ notices: [notice], now, textingAllowed: pro }).flatMap((one) =>
        one.planned.map((row) => row.dedupeKey),
      );

    expect(keys(before(24))).toEqual(['booking.reminder:booking-1:2h24:learner-1']);
    // An hour later the same reminder is still the same reminder: the same key, so one row.
    expect(keys(before(23))).toEqual(['booking.reminder:booking-1:2h24:learner-1']);
    expect(keys(before(2))).toEqual([
      'booking.reminder:booking-1:2h24:learner-1',
      'booking.reminder:booking-1:2h2:learner-1',
    ]);
  });

  it('reminds about a lesson that moved at its new time, and not its old one', () => {
    // The lesson was moved two days later, which counts as a new version of it.
    const moved: ReminderNotice = {
      ...notice,
      version: 3,
      starts_at: new Date(lesson.getTime() + 48 * 3_600_000).toISOString(),
    };

    // At what would have been two hours before the old time, nothing is due.
    expect(planReminders({ notices: [moved], now: before(2), textingAllowed: pro })).toEqual([]);

    // And at the new time's own moment, the reminder is a different one.
    const [first] = planReminders({
      notices: [moved],
      now: new Date(new Date(moved.starts_at).getTime() - 24 * 3_600_000),
      textingAllowed: pro,
    });
    expect(first?.planned[0]?.dedupeKey).toBe('booking.reminder:booking-1:3h24:learner-1');
  });

  it('follows what the Business asked for instead of the default (NTF-02)', () => {
    const own = { ...notice, reminder_settings: { reminder_hours_before: [3] } };
    expect(planReminders({ notices: [own], now: before(24), textingAllowed: pro })).toEqual([]);
    const [first] = planReminders({ notices: [own], now: before(3), textingAllowed: pro });
    expect(first?.hoursBefore).toBe(3);
  });

  it('texts on a plan that includes it, and not on one that does not (NTF-01)', () => {
    const [onPro] = planReminders({ notices: [notice], now: before(24), textingAllowed: pro });
    expect(onPro?.planned[0]?.channels).toContain('sms');

    const [onFree] = planReminders({ notices: [notice], now: before(24), textingAllowed: () => false });
    expect(onFree?.planned[0]?.channels).not.toContain('sms');
  });

  it('does not text somebody whose number we do not have', () => {
    const noPhone = { ...notice, learner_phone: null };
    const [first] = planReminders({ notices: [noPhone], now: before(24), textingAllowed: pro });
    expect(first?.planned[0]?.channels).not.toContain('sms');
  });

  it('leaves out a learner who has switched reminders off (NTF-04)', () => {
    const reminders = planReminders({
      notices: [notice],
      now: before(24),
      muted: new Map([['learner-1', ['in_app', 'push', 'email', 'sms']]]),
      textingAllowed: pro,
    });
    expect(reminders).toEqual([]);
  });

  it('writes rows the database can take, and asks about each learner once', () => {
    const reminders = planReminders({ notices: [notice, notice], now: before(24), textingAllowed: pro });
    const rows = reminderRows(reminders);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: 'learner-1',
      business_id: 'business-1',
      kind: 'booking.reminder',
      category: 'reminders',
      entity_type: 'booking',
      entity_id: 'booking-1',
    });
    expect(peopleToRemind([notice, notice])).toEqual(['learner-1']);
  });
});
