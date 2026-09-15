import { describe, expect, it } from 'vitest';
import { setupComplete, setupProgress, setupTasks, type SetupState } from './setup-checklist.ts';

const fresh: SetupState = { learners: 0, paymentsConnected: false, verified: false, badgeInDate: true };

function doneIds(state: SetupState): string[] {
  return setupTasks(state)
    .filter((task) => task.done)
    .map((task) => task.id);
}

describe('setup checklist (PRD 10.1, M1-10)', () => {
  it('starts with nothing done', () => {
    expect(doneIds(fresh)).toEqual([]);
    expect(setupProgress(fresh)).toEqual({ done: 0, total: 3, percent: 0 });
    expect(setupComplete(fresh)).toBe(false);
  });

  it('ticks the first learner as soon as there is one', () => {
    expect(doneIds({ ...fresh, learners: 1 })).toEqual(['first-learner']);
  });

  it('ticks payments when the account can actually take money', () => {
    expect(doneIds({ ...fresh, paymentsConnected: true })).toEqual(['connect-payments']);
  });

  it('waits for the badge check before asking anyone to share a link', () => {
    const [, , link] = setupTasks(fresh);
    expect(link).toEqual({ id: 'booking-link', done: false, blockedBy: 'verification' });
    expect(doneIds({ ...fresh, verified: true })).toEqual(['booking-link']);
  });

  it('does not tick a link the instructor has hidden', () => {
    expect(doneIds({ ...fresh, verified: true, badgeInDate: false })).toEqual([]);
  });

  it('counts how far along the list is', () => {
    expect(setupProgress({ learners: 2, paymentsConnected: true, verified: false, badgeInDate: true })).toEqual({
      done: 2,
      total: 3,
      percent: 67,
    });
  });

  it('is finished only when all three are', () => {
    const all: SetupState = { learners: 1, paymentsConnected: true, verified: true, badgeInDate: true };
    expect(setupComplete(all)).toBe(true);
    expect(setupProgress(all).percent).toBe(100);
  });
});
