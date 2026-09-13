/**
 * What each notification says (NTF-03, PRD Appendix B).
 *
 * The same event reads differently depending on who is reading it: a lesson somebody booked
 * is "your lesson is booked" to the learner and "Jack Taylor booked a lesson" to the
 * instructor. The words live here, next to the catalogue, so the inbox, the email and the
 * push notice cannot drift apart.
 */

import type { NotificationAudience, NotificationKind } from './catalogue.ts';

export interface NotificationFacts {
  learnerName?: string;
  instructorName?: string;
  /** When the lesson is, written the way the app writes dates: "Wed 16 Sep at 09:00". */
  when?: string;
  /** Whatever else the line needs: a reason, a fee in words, how long until the lesson. */
  detail?: string;
}

export interface NotificationCopy {
  title: string;
  body: string;
}

/** A sentence that does not end in a stray full stop when the fact behind it is missing. */
function sentence(...parts: (string | undefined)[]): string {
  const line = parts.filter((part) => part && part.trim() !== '').join(' ');
  return line === '' ? '' : /[.?!]$/.test(line) ? line : `${line}.`;
}

function theirName(audience: NotificationAudience, facts: NotificationFacts): string | undefined {
  return audience === 'learner' ? facts.instructorName : facts.learnerName;
}

/** One line of who and when, from the reader's side: "Wed 16 Sep at 09:00 with Sarah Khan". */
function whenWith(audience: NotificationAudience, facts: NotificationFacts): string {
  const name = theirName(audience, facts);
  const withWhom = audience === 'school' && facts.instructorName ? `with ${facts.instructorName}` : name ? `with ${name}` : undefined;
  return sentence(facts.when, withWhom);
}

/** The words for one kind, read by one audience. */
export function notificationCopy(
  kind: NotificationKind,
  audience: NotificationAudience,
  facts: NotificationFacts,
): NotificationCopy {
  const them = theirName(audience, facts) ?? 'Somebody';
  const line = whenWith(audience, facts);

  switch (kind) {
    case 'booking.confirmed':
      return audience === 'learner'
        ? { title: 'Lesson booked', body: line }
        : { title: `${them} has a lesson booked`, body: line };

    case 'booking.requested':
      return { title: `${them} asked for a lesson`, body: sentence(facts.when, 'Accept it or decline it') };

    case 'booking.answered':
      return { title: 'Your lesson request was answered', body: sentence(line, facts.detail) };

    case 'booking.reminder':
      return audience === 'learner'
        ? { title: `Lesson ${facts.detail ?? 'soon'}`, body: line }
        : { title: `Lesson ${facts.detail ?? 'soon'} with ${them}`, body: line };

    case 'booking.rescheduled':
      return audience === 'learner'
        ? { title: 'Lesson moved', body: sentence('Now', line) }
        : { title: `${them}'s lesson moved`, body: sentence('Now', line) };

    case 'booking.cancelled':
      return audience === 'learner'
        ? { title: 'Lesson cancelled', body: sentence(line, facts.detail) }
        : { title: `${them}'s lesson was cancelled`, body: sentence(line, facts.detail) };

    case 'payment.received':
      return audience === 'learner'
        ? { title: 'Payment received', body: sentence(facts.detail, line) }
        : { title: `${them} paid`, body: sentence(facts.detail, line) };

    case 'payment.failed':
      return audience === 'learner'
        ? { title: 'A payment did not go through', body: sentence(facts.detail, 'Try again to keep the lesson') }
        : { title: `A payment from ${them} did not go through`, body: sentence(facts.detail, line) };

    case 'lesson_record.added':
      return { title: 'Your lesson record is ready', body: sentence(line, facts.detail) };

    case 'credit.low':
      return audience === 'learner'
        ? { title: 'Your credit is running low', body: sentence(facts.detail, 'Top it up before your next lesson') }
        : { title: `${them} is running low on credit`, body: sentence(facts.detail) };

    case 'verification.decided':
      return { title: 'Your verification was reviewed', body: sentence(facts.detail) };

    case 'badge.expiring':
      return { title: 'Your badge is running out', body: sentence(facts.detail) };

    case 'learner.joined':
      return { title: `${them} joined you`, body: sentence(facts.detail ?? 'They can be booked in now') };
  }
}
