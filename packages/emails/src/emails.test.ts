import { notificationCatalogue, notificationCopy } from '@repo/core/notifications';
import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from './render.ts';

const lesson = {
  learnerName: 'Jack Taylor',
  instructorName: 'Sarah Khan',
  when: 'Wed 16 Sep at 09:00',
  detail: 'tomorrow',
};

/** Em dash and en dash: never in anything a person reads (CLAUDE.md rule 9). */
const DASHES = /[\u2013\u2014]/;

describe('the notification email (NTF-03, M2-28)', () => {
  it('says what the app says, in words and in HTML', async () => {
    const email = await renderNotificationEmail({
      title: 'Lesson booked',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan.',
      greeting: 'Hello Jack',
      facts: [
        { label: 'When', value: 'Wed 16 Sep at 09:00' },
        { label: 'With', value: 'Sarah Khan' },
      ],
      action: { label: 'See your lessons', url: 'https://example.com/app/learner/lessons' },
      settingsUrl: 'https://example.com/notifications/settings',
    });

    expect(email.subject).toBe('Lesson booked');
    expect(email.html).toContain('Lesson booked');
    expect(email.html).toContain('Wed 16 Sep at 09:00 with Sarah Khan.');
    expect(email.html).toContain('https://example.com/app/learner/lessons');
    expect(email.html).toContain('Hello Jack');
    // The facts a person is looking for, laid out rather than buried in a sentence.
    expect(email.html).toContain('When');
    expect(email.html).toContain('With');
    // Why they got it, and how to stop getting it (NTF-04).
    expect(email.html).toContain('https://example.com/notifications/settings');
    expect(email.text).toContain('See your lessons');
    expect(email.text).toContain('Wed 16 Sep at 09:00 with Sarah Khan.');
  });

  it('leaves out the parts it was not given', async () => {
    const email = await renderNotificationEmail({
      title: 'Your badge is running out',
      body: 'It expires in 30 days.',
    });

    expect(email.html).toContain('Your badge is running out');
    expect(email.html).not.toContain('Choose what you hear about');
    expect(email.text).not.toContain('undefined');
    expect(email.text).toContain('You are getting this because you have a');
  });

  it('says why it came to somebody who gave their details without an account (MKT-10)', async () => {
    const email = await renderNotificationEmail({
      title: 'You are on the waiting list for LS',
      body: 'We will email you when you can book.',
      reason: 'you joined the waiting list for LS',
    });
    expect(email.text).toContain('You are getting this because you joined the waiting list for LS.');
    expect(email.text).not.toContain('account');
  });

  it('writes every notification in the catalogue without a dash anybody has to guess at', async () => {
    for (const spec of Object.values(notificationCatalogue)) {
      if (!spec.channels.includes('email')) continue;
      for (const audience of spec.audiences) {
        const copy = notificationCopy(spec.kind, audience, lesson);
        const email = await renderNotificationEmail({
          ...copy,
          greeting: 'Hello Jack',
          facts: [{ label: 'When', value: lesson.when }],
          action: { label: 'Open it', url: 'https://example.com/notifications' },
          settingsUrl: 'https://example.com/notifications/settings',
        });

        expect(email.subject, `${spec.kind} to a ${audience}`).not.toMatch(DASHES);
        expect(email.html, `${spec.kind} to a ${audience}`).not.toMatch(DASHES);
        expect(email.text, `${spec.kind} to a ${audience}`).not.toMatch(DASHES);
        // HTML escapes an apostrophe, and the words are the same words.
        expect(email.html).toContain(copy.title.replaceAll("'", '&#x27;'));
      }
    }
  });
});
