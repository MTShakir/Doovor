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
  /** The badge is in date, so the booking link takes bookings (INS-03). Hiding from search does not matter (PUB-04). */
  badgeInDate: boolean;
}

export type SetupTaskId = 'first-learner' | 'connect-payments' | 'booking-link';

export interface SetupTask {
  id: SetupTaskId;
  done: boolean;
  /** Why it cannot be done yet, when something else has to happen first. */
  blockedBy?: 'verification';
}

export function setupTasks(state: SetupState): SetupTask[] {
  const linkLive = state.verified && state.badgeInDate;
  return [
    { id: 'first-learner', done: state.learners > 0 },
    { id: 'connect-payments', done: state.paymentsConnected },
    // A link nobody can open is not worth sharing, so this waits for the badge check.
    linkLive ? { id: 'booking-link', done: true } : { id: 'booking-link', done: false, blockedBy: 'verification' },
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
