import { brand } from '@repo/config/brand';
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
  textMessageCopy,
  type NotificationAudience,
  type NotificationChannel,
} from './catalogue.ts';
import { notificationCopy, offeredPupilLine } from './copy.ts';
import { channelsFor, notificationDedupeKey, planNotifications } from './plan.ts';

const lesson = { learnerName: 'Jack Taylor', instructorName: 'Sarah Khan', when: 'Wed 16 Sep at 09:00' };

describe('the catalogue (PRD Appendix B, NTF-03)', () => {
  it('has every kind of notification Phase 1 sends', () => {
    expect(notificationKinds).toHaveLength(31);
    for (const kind of notificationKinds) expect(notificationCatalogue[kind].kind).toBe(kind);
  });

  it('sends everything to at least one audience, on at least the inbox', () => {
    for (const spec of Object.values(notificationCatalogue)) {
      expect(spec.audiences.length).toBeGreaterThan(0);
      expect(spec.channels).toContain('in_app');
      expect(notificationCategories).toContain(spec.category);
    }
  });

  it('texts about a lesson coming, and about money about to leave (NTF-01, D-237)', () => {
    const texting = Object.values(notificationCatalogue).filter((spec) => spec.channels.includes('sms'));
    // NTF-01 says texts are for reminders only. The second one is the product owner's, and is a
    // reminder of the same kind: a thing about to happen that somebody may want to stop first,
    // except that this one takes £120 if they do not read it (D-237). Nothing else may text.
    expect(texting.map((spec) => spec.kind)).toEqual(['booking.reminder', 'subscription.renewing']);
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

describe('the welcome, once an email is confirmed (NTF-03, NTF-06, D-259)', () => {
  const audiences: NotificationAudience[] = ['learner', 'instructor', 'school'];

  it('welcomes each side by name of the product, says what to do next, and where to ask for help', () => {
    const bodies = audiences.map((audience) => {
      const copy = notificationCopy('account.welcome', audience, {});
      expect(copy.title, audience).toBe(`Welcome to ${brand.name}`);
      expect(copy.body, audience).toContain(brand.supportEmail);
      expect(copy.body.length, audience).toBeLessThanOrEqual(400);
      expect(copy.body, audience).not.toMatch(/[\u2013\u2014]/);
      return copy.body;
    });
    // Each side is told what is next for them, not one line for everybody.
    expect(new Set(bodies).size).toBe(3);
  });

  it('arrives by email and in the inbox, once for each person, whatever they have switched off', () => {
    const plan = (muted?: ('email' | 'push')[]) =>
      planNotifications({
        kind: 'account.welcome',
        entityId: 'user-1',
        facts: {},
        recipients: [{ userId: 'user-1', audience: 'instructor', muted }],
        linkFor: () => '/start',
      });
    const [welcome, ...more] = plan();
    expect(more).toEqual([]);
    expect(welcome).toMatchObject({ channels: ['in_app', 'email'], category: 'account', link: '/start' });
    expect(welcome?.dedupeKey).toBe(notificationDedupeKey('account.welcome', 'user-1', 'user-1'));
    // A service message about their own account: the inbox keeps it even with email switched off.
    expect(plan(['email'])[0]?.channels).toEqual(['in_app']);
  });
});

describe('a badge decided, and a badge running out (INS-02, INS-03, Appendix B, D-260)', () => {
  it('tells the instructor they are verified, or why not and what to do, in their own words', () => {
    expect(notificationCopy('verification.decided', 'instructor', { instructorName: 'Ian', approved: true })).toEqual({
      title: 'You are verified',
      body: 'Your badge has been checked, and your profile now shows you as a verified instructor.',
    });
    expect(
      notificationCopy('verification.decided', 'instructor', { instructorName: 'Ian', approved: false, detail: 'The photo is too blurred to read' }),
    ).toEqual({
      title: 'Your badge was not verified',
      body: 'The photo is too blurred to read. Send it again from your profile and we will check it.',
    });
  });

  it('tells the school about its instructor by name', () => {
    expect(notificationCopy('verification.decided', 'school', { instructorName: 'Ian One', approved: true }).title).toBe('Ian One is verified');
    const refused = notificationCopy('verification.decided', 'school', { instructorName: 'Ian One', approved: false, detail: 'The photo is blurred' });
    expect(refused.title).toBe('Ian One was not verified');
    expect(refused.body).toBe('The photo is blurred. They can send it again from their profile.');
  });

  it('warns the instructor and the school about a badge running out, each in their own words', () => {
    expect(notificationCopy('badge.expiring', 'instructor', { detail: 'Your instructor badge expires in 30 days', when: 'Wed 31 Mar' })).toEqual({
      title: 'Your badge is running out',
      body: 'Your instructor badge expires in 30 days. Renew it with the DVSA. Once the old one runs out, send the new one from your profile and we will check it.',
    });
    expect(notificationCopy('badge.expiring', 'school', { instructorName: 'Ian One', when: 'Wed 31 Mar' })).toEqual({
      title: "Ian One's badge is running out",
      body: 'It expires on Wed 31 Mar. They can send the new one from their profile once they have renewed it.',
    });
  });
});

describe('a learner who accepted an invitation (LRN-03, Appendix B, D-301)', () => {
  it('tells the instructor who sent it that they can book them in now', () => {
    expect(notificationCopy('learner.joined', 'instructor', { learnerName: 'Nina New', instructorName: 'Ian One' })).toEqual({
      title: 'Nina New joined you',
      body: 'They accepted your invitation and can be booked in now.',
    });
  });

  it('tells the school who joined and who invited them', () => {
    expect(notificationCopy('learner.joined', 'school', { learnerName: 'Nina New', instructorName: 'Ian One' })).toEqual({
      title: 'Nina New joined',
      body: 'Ian One invited them. They can be booked in now.',
    });
    expect(notificationCopy('learner.joined', 'school', { learnerName: 'Nina New' }).body).toBe(
      'They accepted an invitation and can be booked in now.',
    );
  });

  it('arrives in the inbox and on a phone, with the rest of the account group (NTF-04)', () => {
    expect(notificationCatalogue['learner.joined']).toMatchObject({ channels: ['in_app', 'push'], category: 'account', essential: false });
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

  it('offers each person only what they can be sent (D-344)', () => {
    // The only money text is the warning before an instructor's yearly plan renews.
    expect(channelsInCategory('money', ['learner'])).toEqual(['in_app', 'email', 'push']);
    expect(channelsInCategory('money', ['instructor'])).toEqual(['in_app', 'email', 'push', 'sms']);
    expect(switchableChannels('money', ['learner'])).toEqual(['email', 'push']);
    // Somebody who both learns and teaches is offered both.
    expect(channelsInCategory('money', ['learner', 'instructor'])).toEqual(['in_app', 'email', 'push', 'sms']);
    expect(channelsInCategory('reminders', ['learner'])).toEqual(['in_app', 'email', 'push', 'sms']);
  });

  it('says what a text carries, for whoever is reading (D-344)', () => {
    expect(textMessageCopy('reminders', ['learner'])).toBe('Reminders only, when your instructor sends them by text.');
    expect(textMessageCopy('reminders', ['instructor'])).toBe('Reminders only, on the Pro plan.');
    expect(textMessageCopy('reminders', ['learner', 'instructor'])).toBe('Reminders only, on the Pro plan.');
    expect(textMessageCopy('money', ['instructor'])).toBe('Only to warn you before a yearly plan renews.');
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

  it('says once for lessons booked every week in one go (D-349)', () => {
    const series = { ...lesson, detail: 'The first of 4, every Wednesday at 09:00 until Wed 7 Oct' };
    expect(notificationCopy('booking.confirmed', 'learner', series).body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. The first of 4, every Wednesday at 09:00 until Wed 7 Oct.',
    );
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

  it('closes a sentence before the next one starts', () => {
    expect(notificationCopy('booking.requested', 'instructor', lesson).body).toBe('Wed 16 Sep at 09:00. Accept it or decline it.');
    expect(notificationCopy('payment.received', 'instructor', { ...lesson, detail: '£42 by card' }).body).toBe(
      '£42 by card. Wed 16 Sep at 09:00 with Jack Taylor.',
    );
    expect(notificationCopy('payment.received', 'learner', { instructorName: 'Sarah Khan', detail: '£380 for 10 hours of credit' }).body).toBe(
      '£380 for 10 hours of credit.',
    );
    expect(notificationCopy('credit.low', 'learner', { detail: '1 hour left with Quayside Driving School' }).body).toBe(
      '1 hour left with Quayside Driving School. Top it up before your next lesson.',
    );
  });

  it('says a payment is overdue, and sums up the day before for a school (NTF-03, M3-22)', () => {
    expect(notificationCopy('payment.overdue', 'learner', { ...lesson, learnerDetail: '£42 has been owed since Tue 15 Sep. Pay it now.' })).toEqual({
      title: 'Payment overdue',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan. £42 has been owed since Tue 15 Sep. Pay it now.',
    });
    expect(notificationCopy('payment.overdue', 'instructor', { ...lesson, detail: '£42 has been owed since Tue 15 Sep.' }).title).toBe(
      'A payment from Jack Taylor is overdue',
    );
    expect(notificationCopy('payment.daily_summary', 'school', { detail: '£420 from 10 payments on Mon 14 Sep' })).toEqual({
      title: 'Payments yesterday',
      body: '£420 from 10 payments on Mon 14 Sep.',
    });
  });

  it('tells the Business a no-show was disputed, and the learner how it was decided (R-09, M3-19)', () => {
    expect(notificationCopy('booking.disputed', 'instructor', lesson)).toEqual({
      title: 'Jack Taylor disputed a no-show',
      body: 'Wed 16 Sep at 09:00 with Jack Taylor. Decide whether the fee stands.',
    });
    expect(notificationCopy('booking.dispute_decided', 'learner', { ...lesson, learnerDetail: 'The fee stands.' })).toEqual({
      title: 'Your no-show dispute was answered',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan. The fee stands.',
    });
  });

  it('says who did not turn up, and tells a learner a fee that could not be charged is not a lesson to keep (R-09, M3-19)', () => {
    expect(notificationCopy('booking.no_show', 'learner', { ...lesson, learnerDetail: 'A fee of £42 is owed.' })).toEqual({
      title: 'Marked as a no-show',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan. A fee of £42 is owed.',
    });
    expect(notificationCopy('booking.no_show', 'instructor', { ...lesson, detail: 'A fee of £42 is owed.' }).title).toBe('Jack Taylor did not turn up');
    expect(notificationCopy('payment.failed', 'learner', { ...lesson, learnerDetail: 'The no-show fee could not be charged. Pay it now.' }).body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. The no-show fee could not be charged. Pay it now.',
    );
    expect(notificationCopy('payment.failed', 'learner', { ...lesson, detail: 'The card was refused.' }).body).toBe(
      'Wed 16 Sep at 09:00 with Sarah Khan. The card was refused. Pay now to keep the lesson.',
    );
  });

  it('tells a learner their lesson record is ready, with the lesson and what the instructor wrote (PRD 10.2 step 4, M4-12)', () => {
    expect(notificationCopy('lesson_record.added', 'learner', { ...lesson, detail: 'Good junctions, and mirrors checked early' })).toEqual({
      title: 'Your lesson record is ready',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan. Good junctions, and mirrors checked early.',
    });
  });

  it('tells the learner what only the learner needs to hear, and the others the rest (acceptance-04)', () => {
    const facts = { ...lesson, detail: 'Jack Taylor cancelled late, so the £42 they paid is kept as the fee.', learnerDetail: 'You cancelled 24 hours before it started.' };
    expect(notificationCopy('booking.cancelled', 'learner', facts).body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. You cancelled 24 hours before it started.');
    expect(notificationCopy('booking.cancelled', 'instructor', facts).body).toBe(
      'Wed 16 Sep at 09:00 with Jack Taylor. Jack Taylor cancelled late, so the £42 they paid is kept as the fee.',
    );
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

  it('tells whoever made the change in the inbox only (D-384)', () => {
    const instructor = { userId: 'u2', audience: 'instructor' as NotificationAudience, ownChange: true };
    expect(channelsFor('booking.confirmed', instructor)).toEqual(['in_app']);
    expect(channelsFor('booking.cancelled', instructor)).toEqual(['in_app']);
    // The inbox they switched off stays off, unless the message is a service one.
    expect(channelsFor('credit.low', { ...instructor, muted: ['in_app'] })).toEqual([]);
    expect(channelsFor('booking.cancelled', { ...instructor, muted: ['in_app'] })).toEqual(['in_app']);
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

describe("a school's own arrangements (M9-28, D-295)", () => {
  const school = { schoolName: 'Quayside Driving School' };

  it('offers a pupil with as much as the instructor sees before accepting, and when to answer by', () => {
    const detail = offeredPupilLine({ firstName: 'Pat', area: 'M1', transmission: 'automatic' });
    expect(detail).toBe('Pat, near M1, for automatic lessons');
    expect(offeredPupilLine({ firstName: 'Pat', area: null, transmission: null })).toBe('Pat');
    expect(notificationCopy('pupil.offered', 'instructor', { ...school, detail, when: 'Wed 21 Oct at 14:30' })).toEqual({
      title: 'Quayside Driving School has a pupil for you',
      body: 'Pat, near M1, for automatic lessons. Answer by Wed 21 Oct at 14:30.',
    });
  });

  it('tells the school who took a pupil', () => {
    expect(notificationCopy('pupil.taken', 'school', { learnerName: 'Pat Pupil', instructorName: 'Sarah Khan' })).toEqual({
      title: 'Pat Pupil has an instructor',
      body: 'Sarah Khan took them, and has their details to get in touch.',
    });
  });

  it('tells a linked instructor their fees, each one due, and each one settled', () => {
    const terms = '£15 a week, the first due Mon 16 Nov, after 2 free weeks. £10 for each pupil the school introduces';
    expect(notificationCopy('school_fee.terms_set', 'instructor', { ...school, detail: terms })).toEqual({
      title: 'Quayside Driving School set your fees',
      body: `${terms}.`,
    });
    expect(notificationCopy('school_fee.due', 'instructor', { ...school, detail: '£15 for the week from Mon 16 Nov' })).toEqual({
      title: 'A fee to Quayside Driving School is due',
      body: '£15 for the week from Mon 16 Nov. Pay it as you agreed, and they mark it paid.',
    });
    expect(notificationCopy('school_fee.settled', 'instructor', { ...school, outcome: 'paid', detail: '£15 for the week from Mon 16 Nov' })).toEqual({
      title: 'Quayside Driving School marked a fee paid',
      body: '£15 for the week from Mon 16 Nov.',
    });
    expect(notificationCopy('school_fee.settled', 'instructor', { ...school, outcome: 'written_off', detail: '£10 for introducing Pat Pupil' })).toEqual({
      title: 'Quayside Driving School wrote off a fee',
      body: '£10 for introducing Pat Pupil. You do not owe it.',
    });
  });

  it('asks a learner to choose, in the words of the choice itself (D-292)', () => {
    expect(notificationCopy('learner.move_asked', 'learner', { ...school, instructorName: 'Asha Patel', outcome: 'joined_school' })).toEqual({
      title: 'Asha Patel now teaches for Quayside Driving School',
      body: 'Move to Quayside Driving School to keep learning with them, or not now. Nothing changes until you choose.',
    });
    expect(notificationCopy('learner.move_asked', 'learner', { ...school, businessName: 'Patel Driving', outcome: 'left_school' })).toEqual({
      title: 'Patel Driving no longer works with Quayside Driving School',
      body: 'Quayside Driving School introduced you. Go back to it and it will find you an instructor, or keep learning with Patel Driving.',
    });
  });

  it('tells the school who moved to it, and who teaches them, and the instructor who they came with (D-306)', () => {
    expect(notificationCopy('learner.moved', 'school', { ...school, learnerName: 'Pat Pupil', businessName: 'Patel Driving', outcome: 'left_school' })).toEqual({
      title: 'Pat Pupil came back to you',
      body: 'Patel Driving no longer works with you, and they chose to come back. Choose who teaches them.',
    });
    expect(notificationCopy('learner.moved', 'school', { ...school, learnerName: 'Lee One', instructorName: 'Asha Patel', outcome: 'joined_school' })).toEqual({
      title: 'Lee One moved to you',
      body: 'They came with Asha Patel, who keeps teaching them.',
    });
    expect(notificationCopy('learner.moved', 'instructor', { ...school, learnerName: 'Lee One', instructorName: 'Asha Patel', outcome: 'joined_school' })).toEqual({
      title: 'Lee One moved with you',
      body: 'They learn with you at Quayside Driving School now.',
    });
    expect(notificationCopy('learner.moved', 'school', { outcome: 'left_school' }).title).toBe('A learner came back to you');
    // Nobody teaches them until the school chooses, so it reaches the inbox whatever is switched off.
    expect(channelsFor('learner.moved', { userId: 'ben-1', audience: 'school', muted: ['in_app', 'email', 'push'] })).toEqual(['in_app']);
  });

  it('tells an instructor who the school gave them, and how to reach them (D-325)', () => {
    expect(notificationCopy('learner.assigned', 'instructor', { ...school, learnerName: 'Pat Pupil' })).toEqual({
      title: 'Pat Pupil is with you now',
      body: 'Quayside Driving School chose you to teach them. Open their card to get in touch.',
    });
    expect(notificationCopy('learner.assigned', 'instructor', {})).toEqual({
      title: 'A learner is with you now',
      body: 'Your school chose you to teach them. Open their card to get in touch.',
    });
    // Somebody new to teach reaches the inbox whatever is switched off.
    expect(channelsFor('learner.assigned', { userId: 'ian-1', audience: 'instructor', muted: ['in_app', 'email', 'push'] })).toEqual(['in_app']);
  });

  it('tells each side what changes when they part, and somebody switched off how to open their own again', () => {
    expect(notificationCopy('school.left', 'school', { instructorName: 'Asha Patel', outcome: 'left' }).title).toBe('Asha Patel stopped working with you');
    expect(notificationCopy('school.left', 'instructor', { ...school, outcome: 'let_go' }).title).toBe('Quayside Driving School stopped working with you');
    expect(notificationCopy('school.left', 'instructor', { ...school, outcome: 'switched_off', businessName: 'Patel Driving' })).toEqual({
      title: 'Quayside Driving School switched you off',
      body: 'You no longer teach under it. Open Patel Driving again, and its profile and booking link come back with the learners who stayed with it.',
    });
    expect(notificationCopy('school.left', 'instructor', { ...school, outcome: 'switched_off' }).body).toBe('You no longer teach under it.');
  });

  it('keeps an offer and money owed in the inbox, and lets a school switch off hearing who took a pupil', () => {
    const everything = { userId: 'user-1', audience: 'instructor' as const, muted: ['in_app', 'email', 'push'] as NotificationChannel[] };
    expect(channelsFor('pupil.offered', everything)).toEqual(['in_app']);
    expect(channelsFor('school_fee.due', everything)).toEqual(['in_app']);
    expect(channelsFor('pupil.taken', { ...everything, audience: 'school' })).toEqual([]);
  });
});
