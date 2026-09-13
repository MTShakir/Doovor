import { describe, expect, it } from 'vitest';
import {
  dueReminders,
  parseReminderChoice,
  reminderChoiceOf,
  reminderChoices,
  reminderHoursDefault,
  reminderHoursSchema,
  reminderVersion,
  reminderWording,
  resolveReminderHours,
} from './reminders.ts';

const lesson = new Date('2026-09-16T09:00:00Z');
const before = (hours: number): Date => new Date(lesson.getTime() - hours * 3_600_000);

describe('what a Business asks for (NTF-02)', () => {
  it('reminds the day before and two hours before unless told otherwise', () => {
    expect(resolveReminderHours(null, undefined)).toEqual(reminderHoursDefault);
    expect(reminderHoursDefault).toEqual([24, 2]);
  });

  it('takes what the Business changed, in order, without repeats', () => {
    expect(resolveReminderHours({ reminder_hours_before: [2, 24, 2] })).toEqual([24, 2]);
    expect(resolveReminderHours({ reminder_hours_before: [48] }, { reminder_hours_before: [24, 2] })).toEqual([48]);
  });

  it('falls through a level that has nothing to say', () => {
    expect(resolveReminderHours({}, { reminder_hours_before: [12] })).toEqual([12]);
    expect(resolveReminderHours({ reminder_hours_before: [] }, { reminder_hours_before: [12] })).toEqual([12]);
  });

  it('refuses what nobody could have meant', () => {
    expect(reminderHoursSchema.safeParse([0]).success).toBe(false);
    expect(reminderHoursSchema.safeParse([200]).success).toBe(false);
    expect(reminderHoursSchema.safeParse([24, 12, 6, 2, 1]).success).toBe(false);
  });
});

describe('which reminders are due (NTF-02)', () => {
  const booked = before(72);

  it('sends nothing until the first moment arrives', () => {
    expect(dueReminders({ startsAt: lesson, createdAt: booked, now: before(25), hoursBefore: [24, 2] })).toEqual([]);
  });

  it('sends the day before, then two hours before', () => {
    expect(dueReminders({ startsAt: lesson, createdAt: booked, now: before(24), hoursBefore: [24, 2] })).toEqual([24]);
    expect(dueReminders({ startsAt: lesson, createdAt: booked, now: before(3), hoursBefore: [24, 2] })).toEqual([24]);
    expect(dueReminders({ startsAt: lesson, createdAt: booked, now: before(2), hoursBefore: [24, 2] })).toEqual([
      24, 2,
    ]);
  });

  it('says nothing once the lesson has started', () => {
    expect(dueReminders({ startsAt: lesson, createdAt: booked, now: lesson, hoursBefore: [24, 2] })).toEqual([]);
  });

  it('does not remind somebody about a lesson they booked after the reminder was due', () => {
    // Booked three hours before it starts: the day before has been and gone.
    const late = before(3);
    expect(dueReminders({ startsAt: lesson, createdAt: late, now: before(2), hoursBefore: [24, 2] })).toEqual([2]);
  });

  it('reminds about a lesson that moved at its new time', () => {
    const moved = new Date(lesson.getTime() + 48 * 3_600_000);
    // At the old lesson's two hour mark, the new one is two days away: nothing is due.
    expect(
      dueReminders({ startsAt: moved, createdAt: before(72), now: before(2), hoursBefore: [24, 2] }),
    ).toEqual([]);
  });

  it('gives each reminder of each version of a lesson its own key', () => {
    expect(reminderVersion(3, 24)).toBe('3h24');
    expect(reminderVersion(3, 2)).not.toBe(reminderVersion(4, 2));
  });
});

describe('how a reminder puts it', () => {
  it('says when the lesson is in words somebody uses', () => {
    expect(reminderWording(24)).toBe('tomorrow');
    expect(reminderWording(2)).toBe('in 2 hours');
    expect(reminderWording(1)).toBe('in an hour');
    expect(reminderWording(48)).toBe('in 2 days');
  });
});

describe('what a Business is offered (NTF-02)', () => {
  it('offers a handful of choices, each of which parses back', () => {
    expect(reminderChoices.length).toBeGreaterThan(2);
    for (const choice of reminderChoices) {
      const hours = parseReminderChoice(choice.value);
      expect(hours.length).toBeGreaterThan(0);
      expect(reminderChoiceOf(hours)).toBe(choice.value);
    }
  });

  it('falls back to the default rather than refusing nonsense', () => {
    expect(parseReminderChoice('')).toEqual([24, 2]);
    expect(parseReminderChoice('nonsense')).toEqual([24, 2]);
  });
});
