/**
 * Turning a notification into an email (NTF-03, M2-28).
 *
 * The words are already decided: they are the ones in the inbox, written by the catalogue in
 * packages/core. What is decided here is where the button goes and what it says. No database
 * or provider code, so it is testable on its own; `notifications-send.ts` wires it up.
 */

import type { NotificationEmailProps } from '@repo/emails';

export interface ClaimedNotification {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  channels: string[];
  dedupeKey: string;
}

/** An email goes only where the plan said one should, and only if we know the address. */
export function wantsEmail(one: ClaimedNotification): boolean {
  return one.channels.includes('email') && one.email.trim() !== '';
}

/** What the button says, which is where it goes. */
export function actionLabel(link: string): string {
  if (link.startsWith('/app/learner/lessons')) return 'See your lessons';
  if (link.startsWith('/app/instructor/diary')) return 'Open your diary';
  if (link.startsWith('/app/school/diary')) return 'Open the school diary';
  if (link.startsWith('/app/instructor/learners')) return 'See the learner';
  return 'Open the app';
}

/** "Hello Jack": the name they gave, not the whole of it. */
export function greetingFor(fullName: string): string | undefined {
  const first = fullName.trim().split(/\s+/)[0];
  return first === undefined || first === '' ? undefined : `Hello ${first}`;
}

export interface EmailPropsOptions {
  /** Where this environment lives, so every link in an email is absolute. */
  appUrl: string;
}

export function emailPropsFor(one: ClaimedNotification, options: EmailPropsOptions): NotificationEmailProps {
  const base = options.appUrl.replace(/\/$/, '');
  return {
    title: one.title,
    body: one.body,
    greeting: greetingFor(one.fullName),
    ...(one.link === null ? {} : { action: { label: actionLabel(one.link), url: `${base}${one.link}` } }),
    settingsUrl: `${base}/notifications/settings`,
  };
}
