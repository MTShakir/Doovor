/**
 * What each notification says (NTF-03, PRD Appendix B).
 *
 * The same event reads differently depending on who is reading it: a lesson somebody booked
 * is "your lesson is booked" to the learner and "Jack Taylor booked a lesson" to the
 * instructor. The words live here, next to the catalogue, so the inbox, the email and the
 * push notice cannot drift apart.
 */

import { brand } from '@repo/config/brand';
import type { NotificationAudience, NotificationKind } from './catalogue.ts';

export interface NotificationFacts {
  learnerName?: string;
  instructorName?: string;
  /** When the lesson is, written the way the app writes dates: "Wed 16 Sep at 09:00". */
  when?: string;
  /** Whatever else the line needs: a reason, a fee in words, how long until the lesson. */
  detail?: string;
  /**
   * The same, said to the learner, when they need to be told something the others do not: why
   * a fee was kept, or where their money is going (acceptance-04).
   */
  learnerDetail?: string;
  /** Whether a decision went the person's way: a badge verified rather than refused (D-260). */
  approved?: boolean;
  /** The school it is about, by name (M9-28). */
  schoolName?: string;
  /** The Business somebody would move from, or the one that is paused, by name (D-292). */
  businessName?: string;
  /** Which way it went, for a notice about a school that can go more than one way (M9-28, D-295). */
  outcome?: SchoolNoticeOutcome;
}

/**
 * A learner asked to move because their instructor joined a school or left one (D-292), a link
 * ended by the instructor or by the school, an instructor switched off, a fee paid or written off.
 */
export type SchoolNoticeOutcome = 'joined_school' | 'left_school' | 'left' | 'let_go' | 'switched_off' | 'paid' | 'written_off';

/**
 * A pupil offered to a linked instructor, as much as they see before accepting (D-289):
 * "Pat, near M1, for automatic lessons".
 */
export function offeredPupilLine(pupil: { firstName: string; area: string | null; transmission: 'manual' | 'automatic' | null }): string {
  return [pupil.firstName, pupil.area === null ? undefined : `near ${pupil.area}`, pupil.transmission === null ? undefined : `for ${pupil.transmission} lessons`]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .join(', ');
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

/**
 * A part that is a sentence of its own, closed with a full stop so what follows starts afresh:
 * "£42 by card. Wed 16 Sep at 09:00", not "£42 by card Wed 16 Sep at 09:00".
 */
function closed(part: string | undefined): string | undefined {
  const text = part?.trim() ?? '';
  if (text === '') return undefined;
  return /[.?!]$/.test(text) ? text : `${text}.`;
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

/** The first thing somebody is told to do once their email is confirmed (D-259). */
const welcomeNext: Record<NotificationAudience, string> = {
  learner: 'Your email is confirmed. Find an instructor, book your lessons and see your progress, all in one place.',
  instructor:
    'Your email is confirmed. Finish setting up and you can take bookings and payments and keep track of every learner, all in one place.',
  school: 'Your email is confirmed. Finish setting up your school, then bring in your instructors and learners.',
};

const helpLine = `Any questions as you get going? Email ${brand.supportEmail} and we will help.`;

/** The words for one kind, read by one audience. */
export function notificationCopy(
  kind: NotificationKind,
  audience: NotificationAudience,
  facts: NotificationFacts,
): NotificationCopy {
  const them = theirName(audience, facts) ?? 'Somebody';
  const line = whenWith(audience, facts);
  const school = facts.schoolName ?? 'Your school';

  switch (kind) {
    case 'booking.confirmed':
      return audience === 'learner'
        ? { title: 'Lesson booked', body: line }
        : { title: `${them} has a lesson booked`, body: line };

    case 'booking.requested':
      return { title: `${them} asked for a lesson`, body: sentence(closed(facts.when), 'Accept it or decline it') };

    case 'booking.answered':
      return { title: 'Your lesson request was answered', body: sentence(line, facts.detail) };

    case 'booking.reminder':
      return audience === 'learner'
        ? { title: `Lesson ${facts.detail ?? 'soon'}`, body: line }
        : { title: `Lesson ${facts.detail ?? 'soon'} with ${them}`, body: line };

    case 'booking.starting':
      return { title: `Start your lesson with ${them}`, body: line };

    case 'booking.rescheduled':
      return audience === 'learner'
        ? { title: 'Lesson moved', body: sentence('Now', line) }
        : { title: `${them}'s lesson moved`, body: sentence('Now', line) };

    case 'booking.cancelled':
      return audience === 'learner'
        ? { title: 'Lesson cancelled', body: sentence(line, facts.learnerDetail ?? facts.detail) }
        : { title: `${them}'s lesson was cancelled`, body: sentence(line, facts.detail) };

    case 'booking.no_show':
      return audience === 'learner'
        ? { title: 'Marked as a no-show', body: sentence(line, facts.learnerDetail ?? facts.detail) }
        : { title: `${them} did not turn up`, body: sentence(line, facts.detail) };

    case 'booking.disputed':
      return { title: `${them} disputed a no-show`, body: sentence(line, facts.detail ?? 'Decide whether the fee stands') };

    case 'booking.dispute_decided':
      return { title: 'Your no-show dispute was answered', body: sentence(line, facts.learnerDetail ?? facts.detail) };

    // The lesson's time only when there was a lesson: credit bought has none to add.
    case 'payment.received':
      return audience === 'learner'
        ? { title: 'Payment received', body: sentence(closed(facts.detail), facts.when ? line : undefined) }
        : { title: `${them} paid`, body: sentence(closed(facts.detail), facts.when ? line : undefined) };

    case 'payment.failed':
      return audience === 'learner'
        ? {
            title: 'A payment did not go through',
            // A fee is not a lesson to keep, so what the learner is told replaces the whole line.
            body: facts.learnerDetail ? sentence(line, facts.learnerDetail) : sentence(line, facts.detail, 'Pay now to keep the lesson'),
          }
        : { title: `A payment from ${them} did not go through`, body: sentence(line, facts.detail) };

    case 'payment.overdue':
      return audience === 'learner'
        ? { title: 'Payment overdue', body: sentence(line, facts.learnerDetail ?? facts.detail) }
        : { title: `A payment from ${them} is overdue`, body: sentence(line, facts.detail) };

    // Sent the next morning, so the day is whole.
    case 'payment.daily_summary':
      return { title: 'Payments yesterday', body: sentence(facts.detail) };

    case 'payment.requested':
      return { title: 'Pay for your lesson', body: sentence(line, facts.detail) };

    case 'lesson_record.added':
      return { title: 'Your lesson record is ready', body: sentence(line, facts.detail) };

    case 'credit.low':
      return audience === 'learner'
        ? { title: 'Your credit is running low', body: sentence(closed(facts.detail), 'Top it up before your next lesson') }
        : { title: `${them} is running low on credit`, body: sentence(facts.detail) };

    // The instructor is told what to do next; their school is told about them by name (D-260).
    case 'verification.decided': {
      const name = facts.instructorName ?? 'Your instructor';
      if (audience === 'school') {
        return facts.approved
          ? { title: `${name} is verified`, body: 'Their badge has been checked, and their profile now shows them as verified.' }
          : { title: `${name} was not verified`, body: sentence(closed(facts.detail), 'They can send it again from their profile') };
      }
      return facts.approved
        ? { title: 'You are verified', body: 'Your badge has been checked, and your profile now shows you as a verified instructor.' }
        : { title: 'Your badge was not verified', body: sentence(closed(facts.detail), 'Send it again from your profile and we will check it') };
    }

    case 'badge.expiring':
      return audience === 'school'
        ? {
            title: `${facts.instructorName ?? 'An instructor'}'s badge is running out`,
            body: sentence(facts.when ? `It expires on ${facts.when}.` : undefined, 'They can send the new one from their profile once they have renewed it'),
          }
        : { title: 'Your badge is running out', body: sentence(closed(facts.detail), 'Renew it with the DVSA. Once the old one runs out, send the new one from your profile and we will check it') };

    case 'subscription.renewing':
      return { title: 'Your Pro renews soon', body: sentence(facts.detail) };

    case 'learner.joined':
      return { title: `${them} joined you`, body: sentence(facts.detail ?? 'They can be booked in now') };

    // What is next depends on the side they signed up for; the way to ask for help does not.
    case 'account.welcome':
      return { title: `Welcome to ${brand.name}`, body: sentence(welcomeNext[audience], helpLine) };

    // A school's own arrangements (M9-28, D-295).
    case 'pupil.offered':
      return {
        title: `${school} has a pupil for you`,
        body: sentence(closed(facts.detail), facts.when ? `Answer by ${facts.when}` : 'Answer it in the app'),
      };

    case 'pupil.taken':
      return {
        title: `${facts.learnerName ?? 'Your pupil'} has an instructor`,
        body: sentence(`${facts.instructorName ?? 'A linked instructor'} took them, and has their details to get in touch`),
      };

    case 'school_fee.terms_set':
      return { title: `${school} set your fees`, body: sentence(facts.detail ?? 'See them in the app') };

    // Nothing is collected here yet (M9-14): the fee is paid as the two of them agreed.
    case 'school_fee.due':
      return { title: `A fee to ${school} is due`, body: sentence(closed(facts.detail), 'Pay it as you agreed, and they mark it paid') };

    case 'school_fee.settled':
      return facts.outcome === 'written_off'
        ? { title: `${school} wrote off a fee`, body: sentence(closed(facts.detail), 'You do not owe it') }
        : { title: `${school} marked a fee paid`, body: sentence(facts.detail ?? 'See your fees in the app') };

    // The same words as the choice on their home screen (D-292).
    case 'learner.move_asked': {
      if (facts.outcome === 'left_school') {
        const from = facts.businessName ?? facts.instructorName ?? 'Your instructor';
        return {
          title: `${from} no longer works with ${school}`,
          body: sentence(`${school} introduced you. Go back to it and it will find you an instructor, or keep learning with ${from}`),
        };
      }
      return {
        title: `${facts.instructorName ?? 'Your instructor'} now teaches for ${school}`,
        body: sentence(`Move to ${school} to keep learning with them, or not now. Nothing changes until you choose`),
      };
    }

    case 'school.left':
      if (audience === 'school') {
        return {
          title: `${facts.instructorName ?? 'A linked instructor'} stopped working with you`,
          body: 'No new fees are raised for them. Pupils you introduced to them are asked whether to come back to you.',
        };
      }
      if (facts.outcome === 'switched_off') {
        return {
          title: `${school} switched you off`,
          body: sentence(
            'You no longer teach under it.',
            facts.businessName ? `Open ${facts.businessName} again, and its profile and booking link come back with the learners who stayed with it` : undefined,
          ),
        };
      }
      return {
        title: `${school} stopped working with you`,
        body: 'You keep your business and your learners, and no new fees are raised. Pupils it introduced are asked whether to go back to it.',
      };
  }
}
