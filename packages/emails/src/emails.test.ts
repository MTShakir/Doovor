import { brand } from '@repo/config/brand';
import { horizontalLogo } from '@repo/config/logo/horizontal';
import { notificationCatalogue, notificationCopy } from '@repo/core/notifications';
import { describe, expect, it } from 'vitest';
import { emailLogo } from './logo.ts';
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

  it('opens with the logo the app draws, and the name where pictures are turned off (D-249)', async () => {
    const email = await renderNotificationEmail({ title: 'Lesson booked', body: 'Wed 16 Sep at 09:00.' });

    expect(email.html).toMatch(new RegExp(`<img[^>]+alt="${brand.name}"[^>]+src="${brand.appUrl}${emailLogo.path}"`));
    expect(email.html).toContain(`width="${String(emailLogo.width)}"`);
    expect(email.html).toContain(`height="${String(emailLogo.height)}"`);
    // Drawn at twice the size it is shown, in the logo's own proportions, on a tile with room round it.
    expect(emailLogo.scale).toBe(2);
    expect(Math.abs(emailLogo.logoWidth / emailLogo.logoHeight - horizontalLogo.width / horizontalLogo.height)).toBeLessThan(0.05);
    expect(emailLogo.width).toBe(emailLogo.logoWidth + emailLogo.padding.x * 2);
    expect(emailLogo.height).toBe(emailLogo.logoHeight + emailLogo.padding.y * 2);
  });

  it('swaps the tile for a white logo in a mail app that says it is dark, and only that (D-275)', async () => {
    const email = await renderNotificationEmail({ title: 'Lesson booked', body: 'Wed 16 Sep at 09:00.' });

    // Both pictures, at the top and signing off, the white one hidden until a dark mail app shows it.
    expect(email.html.match(new RegExp(`src="${brand.appUrl}${emailLogo.darkPath}"`, 'g'))).toHaveLength(2);
    expect(email.html).toMatch(/<img[^>]+class="logo-dark"[^>]+style="[^"]*display:none/);
    expect(email.html).toContain('@media (prefers-color-scheme: dark)');
    expect(email.html).toContain('.logo-light { display: none !important; }');
    // Nothing else is told it is dark: the mail apps already darken the rest well.
    expect(email.html).not.toContain('name="color-scheme"');
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

  // Every notice that can go by email, to everybody it can go to: one test each, so a render has
  // its own time and a failure names the notice (the catalogue grew by seven in M9).
  const emailed = Object.values(notificationCatalogue)
    .filter((spec) => spec.channels.includes('email'))
    .flatMap((spec) => spec.audiences.map((audience) => ({ kind: spec.kind, audience })));

  it.each(emailed)('writes $kind to a $audience without a dash anybody has to guess at', async ({ kind, audience }) => {
    const copy = notificationCopy(kind, audience, lesson);
    const email = await renderNotificationEmail({
      ...copy,
      greeting: 'Hello Jack',
      facts: [{ label: 'When', value: lesson.when }],
      action: { label: 'Open it', url: 'https://example.com/notifications' },
      settingsUrl: 'https://example.com/notifications/settings',
    });

    expect(email.subject).not.toMatch(DASHES);
    expect(email.html).not.toMatch(DASHES);
    expect(email.text).not.toMatch(DASHES);
    // HTML escapes an apostrophe, and the words are the same words.
    expect(email.html).toContain(copy.title.replaceAll("'", '&#x27;'));
  });
});
