/**
 * The three things a new instructor still has to do (PRD 10.1, M1-10).
 *
 * Every item is worked out from something real: a learner that exists, a payments account
 * that can take money, a booking link that would actually open. Nothing here is ticked by
 * having been shown a screen.
 */

export interface SetupState {
  /** Learners linked to this instructor. */
  learners: number;
  /** The Business can take payments: Stripe says charges are enabled (PAY-01). */
  paymentsConnected: boolean;
  /** The badge has been approved, so the public profile is live (INS-02, INS-05). */
  verified: boolean;
  /**
   * There is no badge with us to check: it was skipped at sign-up, or refused, and is the
   * instructor's to send from their profile (INS-02, D-262, D-382). Absent means it was sent.
   */
  badgeToSend?: boolean;
  /** The badge is in date, so the booking link takes bookings (INS-03). Hiding from search does not matter (PUB-04). */
  badgeInDate: boolean;
  /**
   * Somebody supervises them, or they need nobody: only a trainee waits for a school or an approved
   * instructor before anybody can book them (INS-04, R-18, D-343). Absent means they need nobody.
   */
  supervised?: boolean;
  /**
   * They teach under a school, which takes the payments: connecting them is the owner's, and not on
   * the instructor's list at all (D-123).
   */
  paymentsAreTheSchools?: boolean;
}

export type SetupTaskId = 'first-learner' | 'connect-payments' | 'booking-link';

export interface SetupTask {
  id: SetupTaskId;
  done: boolean;
  /** Why it cannot be done yet, when something else has to happen first. */
  blockedBy?: 'badge' | 'verification' | 'renewal' | 'supervision';
}

export function setupTasks(state: SetupState): SetupTask[] {
  const linkLive = state.verified && state.badgeInDate && state.supervised !== false;
  // A link nobody can book is not worth sharing, so this waits for the badge check, and for a
  // trainee for somebody to supervise them (D-343).
  // A badge that has run out was approved once, so it waits for the new one (D-346). One that was
  // never sent, or was refused, waits for the instructor rather than for us (D-382).
  const waitsFor = !state.verified
    ? state.badgeToSend === true
      ? 'badge'
      : 'verification'
    : !state.badgeInDate
      ? 'renewal'
      : 'supervision';
  return [
    { id: 'first-learner', done: state.learners > 0 },
    ...(state.paymentsAreTheSchools ? [] : [{ id: 'connect-payments' as const, done: state.paymentsConnected }]),
    linkLive ? { id: 'booking-link', done: true } : { id: 'booking-link', done: false, blockedBy: waitsFor },
  ];
}

/** How far along the list is, for the ring on the card. */
export function setupProgress(state: SetupState): { done: number; total: number; percent: number } {
  const tasks = setupTasks(state);
  const done = tasks.filter((task) => task.done).length;
  return { done, total: tasks.length, percent: Math.round((done / tasks.length) * 100) };
}

/** The card disappears once there is nothing left on it. */
export function setupComplete(state: SetupState): boolean {
  return setupTasks(state).every((task) => task.done);
}
