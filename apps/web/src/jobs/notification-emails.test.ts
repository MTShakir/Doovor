import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  emailPropsFor,
  greetingFor,
  wantsEmail,
  type ClaimedNotification,
} from './notification-emails';

const one: ClaimedNotification = {
  id: 'n1',
  userId: 'u1',
  email: 'jack.taylor@example.com',
  fullName: 'Jack Taylor',
  kind: 'booking.cancelled',
  title: 'Lesson cancelled',
  body: 'Wed 16 Sep at 09:00 with Sarah Khan.',
  link: '/app/learner/lessons',
  channels: ['in_app', 'push', 'email'],
  dedupeKey: 'booking.cancelled:b1:2:u1',
};

describe('which notifications become an email (NTF-03)', () => {
  it('sends where the plan said to send, and only there', () => {
    expect(wantsEmail(one)).toBe(true);
    expect(wantsEmail({ ...one, channels: ['in_app', 'push'] })).toBe(false);
  });

  it('sends nowhere when there is no address to send to', () => {
    expect(wantsEmail({ ...one, email: '  ' })).toBe(false);
  });
});

describe('what the email says (NTF-03, M2-28)', () => {
  it('uses the words the app used, and a link that works outside it', () => {
    const props = emailPropsFor(one, { appUrl: 'https://app.example.com/' });

    expect(props.title).toBe('Lesson cancelled');
    expect(props.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan.');
    expect(props.greeting).toBe('Hello Jack');
    expect(props.action).toEqual({
      label: 'See your lessons',
      url: 'https://app.example.com/app/learner/lessons',
    });
    expect(props.settingsUrl).toBe('https://app.example.com/notifications/settings');
  });

  it('names the button after where it goes', () => {
    expect(actionLabel('/app/learner/lessons')).toBe('See your lessons');
    expect(actionLabel('/app/instructor/diary?view=day&date=2026-09-16')).toBe('Open your diary');
    expect(actionLabel('/app/school/diary?date=2026-09-16')).toBe('Open the school diary');
    expect(actionLabel('/app/instructor/learners/abc')).toBe('See the learner');
    expect(actionLabel('/somewhere-else')).toBe('Open the app');
  });

  it('has no button when there is nowhere to go', () => {
    expect(emailPropsFor({ ...one, link: null }, { appUrl: 'https://app.example.com' }).action).toBeUndefined();
  });

  it('greets somebody by the name they gave, or not at all', () => {
    expect(greetingFor('Sarah Khan')).toBe('Hello Sarah');
    expect(greetingFor('  ')).toBeUndefined();
  });
});
