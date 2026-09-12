/**
 * Limiting what a stranger can do (NFR-SEC-03, D-008).
 *
 * Postgres counts the hits today. The interface is here so that moving to something else, if
 * load ever demands it, is one implementation rather than a change at every call site.
 */

export interface RateLimit {
  /** What is being limited, for example 'invite'. Combined with `who` to make the key. */
  action: string;
  /** Who is being limited: a user id, or an address when there is no account yet. */
  who: string;
  /** How many are allowed inside one window. */
  max: number;
  /** The window, in seconds. */
  windowSeconds: number;
}

export interface RateLimiter {
  /** Counts one attempt and says whether it is allowed. */
  allow: (limit: RateLimit) => Promise<boolean>;
}

/** The key the store counts against. One shape, so two call sites cannot disagree. */
export function rateLimitKey(limit: Pick<RateLimit, 'action' | 'who'>): string {
  return `${limit.action}:${limit.who}`;
}

/**
 * The limits the product sets. Keeping them here rather than at each call site means one
 * place to read when asking "what stops someone doing this a thousand times?".
 */
export const rateLimits = {
  /** Invitations sent by one instructor (AUTH-07). Generous for a busy day, not for a script. */
  invite: { max: 30, windowSeconds: 60 * 60 },
  /** Bookings made by one learner (BOK-02). */
  booking: { max: 20, windowSeconds: 60 * 60 },
  /** Messages sent by one person (MSG-01, Phase 2). */
  message: { max: 60, windowSeconds: 60 * 60 },
  /** Anything a signed-out visitor can ask for, keyed by address. */
  anonymous: { max: 60, windowSeconds: 60 * 60 },
} as const;

export type RateLimitedAction = keyof typeof rateLimits;

/** Builds a limit from the catalogue above, so a call site cannot invent its own numbers. */
export function limitFor(action: RateLimitedAction, who: string): RateLimit {
  return { action, who, ...rateLimits[action] };
}

/** Never allows anything. Useful in tests that must prove the refusal path. */
export const denyAll: RateLimiter = { allow: () => Promise.resolve(false) };

/** Always allows. The limiter a test uses when it is testing something else. */
export const allowAll: RateLimiter = { allow: () => Promise.resolve(true) };
