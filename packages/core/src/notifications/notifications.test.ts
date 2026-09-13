import { describe, expect, it } from 'vitest';
import {
  alwaysOnChannels,
  categoryCopy,
  channelCopy,
  channelsInCategory,
  isNotificationKind,
  notificationCatalogue,
  notificationCategories,
  notificationKinds,
  switchableChannels,
  type NotificationAudience,
} from './catalogue.ts';
import { notificationCopy } from './copy.ts';
import { channelsFor, notificationDedupeKey, planNotifications } from './plan.ts';

const lesson = { learnerName: 'Jack Taylor', instructorName: 'Sarah Khan', when: 'Wed 16 Sep at 09:00' };

describe('the catalogue (PRD Appendix B, NTF-03)', () => {
  it('has every kind of notification Phase 1 sends', () => {
    expect(notificationKinds).toHaveLength(14);
    for (const kind of notificationKinds) expect(notificationCatalogue[kind].kind).toBe(kind);
  });

  it('sends everything to at least one audience, on at least the inbox', () => {
    for (const spec of Object.values(notificationCatalogue)) {
      expect(spec.audiences.length).toBeGreaterThan(0);
      expect(spec.channels).toContain('in_app');
      expect(notificationCategories).toContain(spec.category);
    }
  });

  it('texts about reminders and nothing else (NTF-01)', () => {
    const texting = Object.values(notificationCatalogue).filter((spec) => spec.channels.includes('sms'));
    expect(texting.map((spec) => spec.kind)).toEqual(['booking.reminder']);
  });

  it('knows a kind it does not have', () => {
    expect(isNotificationKind('booking.confirmed')).toBe(true);
    expect(isNotificationKind('booking.invented')).toBe(false);
  });

  it('names every category and channel for the settings screen (NTF-04)', () => {
    for (const category of notificationCategories) expect(categoryCopy[category].title).not.toBe('');
    for (const channel of ['in_app', 'email', 'push', 'sms'] as const) expect(channelCopy[channel].title).not.toBe('');
  });
});

describe('what the settings screen offers (NTF-04)', () => {
  it('offers every channel the group can use', () => {
    expect(channelsInCategory('reminders')).toEqual(['in_app', 'email', 'push', 'sms']);
    expect(channelsInCategory('bookings')).toEqual(['in_app', 'email', 'push']);
  });

  it('does not offer to switch off the inbox for a service message', () => {
    expect(alwaysOnChannels('bookings')).toEqual(['in_app']);
    expect(switchableChannels('bookings')).toEqual(['email', 'push']);
  });

  it('lets a reminder be switched off altogether, because it is not one', () => {
    expect(alwaysOnChannels('reminders')).toEqual([]);
    expect(switchableChannels('reminders')).toEqual(['in_app', 'email', 'push', 'sms']);
  });
});

describe('the words (NTF-03)', () => {
  it('writes a title and a line for every kind, to every audience it has', () => {
    for (const spec of Object.values(notificationCatalogue)) {
      for (const audience of spec.audiences) {
        const copy = notificationCopy(spec.kind, audience, { ...lesson, detail: 'tomorrow' });
        expect(copy.title.length).toBeGreaterThan(3);
        expect(copy.body.length).toBeGreaterThan(3);
        // Plain British English, and no dashes anybody has to guess at (rule 9).
        expect(copy.title).not.toMatch(/[\u2013\u2014]/);
        expect(copy.body).not.toMatch(/[\u2013\u2014]/);
        expect(copy.body.endsWith('.')).toBe(true);
      }
    }
  });

  it('says it from the side of whoever is reading it', () => {
    expect(notificationCopy('booking.confirmed', 'learner', lesson)).toEqual({
      title: 'Lesson booked',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan.',
    });
    expect(notificationCopy('booking.confirmed', 'instructor', lesson)).toEqual({
      title: 'Jack Taylor has a lesson booked',
      body: 'Wed 16 Sep at 09:00 with Jack Taylor.',
    });
    // A manager wants to know which of their instructors it was.
    expect(notificationCopy('booking.confirmed', 'school', lesson).body).toBe('Wed 16 Sep at 09:00 with Sarah Khan.');
  });

  it('leaves out what it was not told', () => {
    expect(notificationCopy('booking.cancelled', 'learner', { when: 'Wed 16 Sep at 09:00' })).toEqual({
      title: 'Lesson cancelled',
      body: 'Wed 16 Sep at 09:00.',
    });
    expect(notificationCopy('booking.reminder', 'learner', {}).title).toBe('Lesson soon');
  });

  it('adds the reason or the fee when there is one', () => {
    const copy = notificationCopy('booking.cancelled', 'learner', { ...lesson, detail: 'A fee of £42 applies' });
    expect(copy.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. A fee of £42 applies.');
  });
});

describe('channels, once settings are applied (NTF-04)', () => {
  const learner = { userId: 'u1', audience: 'learner' as NotificationAudience };

  it('sends on every channel the kind has when nothing is switched off', () => {
    expect(channelsFor('booking.confirmed', learner)).toEqual(['in_app', 'push', 'email']);
  });

  it('drops what somebody switched off', () => {
    expect(channelsFor('booking.confirmed', { ...learner, muted: ['email'] })).toEqual(['in_app', 'push']);
  });

  it('drops what their plan does not include', () => {
    expect(channelsFor('booking.reminder', { ...learner, unavailable: ['sms'] })).toEqual(['in_app', 'push', 'email']);
  });

  it('keeps the inbox for a service message, whatever is switched off (NFR-PRV-05)', () => {
    expect(channelsFor('booking.cancelled', { ...learner, muted: ['in_app', 'push', 'email'] })).toEqual(['in_app']);
  });

  it('sends nothing at all when everything optional is switched off', () => {
    expect(channelsFor('credit.low', { ...learner, muted: ['in_app', 'push', 'email'] })).toEqual([]);
  });
});

describe('planning one event (NTF-03)', () => {
  const people = [
    { userId: 'learner-1', audience: 'learner' as NotificationAudience },
    { userId: 'instructor-1', audience: 'instructor' as NotificationAudience },
    { userId: 'manager-1', audience: 'school' as NotificationAudience },
  ];

  it('writes one notification each, to the audiences the kind has', () => {
    const planned = planNotifications({
      kind: 'booking.requested',
      entityId: 'booking-1',
      facts: lesson,
      recipients: people,
    });
    expect(planned.map((one) => one.userId)).toEqual(['instructor-1']);
    expect(planned[0]?.title).toBe('Jack Taylor asked for a lesson');
    expect(planned[0]?.category).toBe('bookings');
  });

  it('gives each person their own key, and a new one each time the lesson changes', () => {
    const first = planNotifications({
      kind: 'booking.rescheduled',
      entityId: 'booking-1',
      version: 2,
      facts: lesson,
      recipients: people,
    });
    expect(first.map((one) => one.dedupeKey)).toEqual([
      'booking.rescheduled:booking-1:2:learner-1',
      'booking.rescheduled:booking-1:2:instructor-1',
      'booking.rescheduled:booking-1:2:manager-1',
    ]);
    const again = planNotifications({
      kind: 'booking.rescheduled',
      entityId: 'booking-1',
      version: 3,
      facts: lesson,
      recipients: people,
    });
    expect(again[0]?.dedupeKey).not.toBe(first[0]?.dedupeKey);
    expect(notificationDedupeKey('booking.cancelled', 'booking-1', 'learner-1')).toBe(
      'booking.cancelled:booking-1:0:learner-1',
    );
  });

  it('takes each person to the screen that answers it', () => {
    const planned = planNotifications({
      kind: 'booking.cancelled',
      entityId: 'booking-1',
      facts: lesson,
      recipients: people,
      linkFor: (audience) => (audience === 'learner' ? '/app/learner/lessons' : '/app/instructor/diary'),
    });
    expect(planned.map((one) => one.link)).toEqual([
      '/app/learner/lessons',
      '/app/instructor/diary',
      '/app/instructor/diary',
    ]);
  });

  it('tells somebody once, even when they are two of the people involved', () => {
    const planned = planNotifications({
      kind: 'booking.cancelled',
      entityId: 'booking-1',
      facts: lesson,
      recipients: [
        { userId: 'owner-1', audience: 'instructor' },
        { userId: 'owner-1', audience: 'school' },
      ],
    });
    expect(planned).toHaveLength(1);
    expect(planned[0]?.audience).toBe('instructor');
  });

  it('leaves out anybody who has switched the whole thing off', () => {
    const planned = planNotifications({
      kind: 'credit.low',
      entityId: 'learner-1',
      facts: lesson,
      recipients: [{ userId: 'learner-1', audience: 'learner', muted: ['in_app', 'push', 'email'] }],
    });
    expect(planned).toEqual([]);
  });
});
