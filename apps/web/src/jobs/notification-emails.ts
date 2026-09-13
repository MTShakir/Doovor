/**
 * Turning a notification into an email (NTF-03, M2-28).
 *
 * The words are already decided: they are the ones in the inbox, written by the catalogue in
 * packages/core. What is decided here is where the button goes and what it says. No database
 * or provider code, so it is testable on its own; `notifications-send.ts` wires it up.
 */

import type { NotificationEmailProps } from '@repo/emails';
import { normaliseUkMobile } from '@repo/core/phone';

export interface ClaimedNotification {
  id: string;
  userId: string;
  email: string;
  /** In E.164, or empty when they have not given us one. */
  phone: string;
  fullName: string;
  businessId: string | null;
  businessPlan: string | null;
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

/**
 * The number to text, in the form a network wants. Numbers are stored the way somebody typed
 * them in, and a text message needs E.164 with its plus.
 */
export function smsNumberFor(one: ClaimedNotification): string | null {
  return normaliseUkMobile(one.phone);
}

/** A text goes only where the plan said one should, and only if we know the number. */
export function wantsSms(one: ClaimedNotification): boolean {
  return one.channels.includes('sms') && smsNumberFor(one) !== null && one.businessId !== null;
}

/** How long a text may be before it costs two messages. */
export const SMS_LIMIT = 300;

/**
 * A text says the same thing as everything else, shorter. No link: a link in a text message
 * is what a phishing text looks like, and the app is one tap away anyway.
 */
export function smsBodyFor(one: ClaimedNotification): string {
  const line = `${one.title}. ${one.body}`.replace(/\s+/g, ' ').trim();
  return line.length <= SMS_LIMIT ? line : `${line.slice(0, SMS_LIMIT - 1).trimEnd()}.`;
}
