/**
 * Sends waiting outbox events to the job runner (M1-01, D-017).
 *
 * RPCs record events in the same transaction as the change they describe, so nothing is lost
 * if the app stops before the send. This module holds no database or job-runner code, so the
 * rules are testable on their own; `outbox.ts` wires it to the real ones.
 */

export interface OutboxEvent {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** What the dispatcher needs from the database: the `system_*` functions. */
export interface OutboxStore {
  claim: (limit: number) => Promise<OutboxEvent[]>;
  markSent: (ids: string[]) => Promise<void>;
  markFailed: (ids: string[], error: string) => Promise<void>;
}

/** What the dispatcher needs from the job runner. */
export type SendEvents = (events: { name: string; data: Record<string, unknown> }[]) => Promise<void>;

export interface DispatchResult {
  sent: number;
  failed: number;
}

/**
 * Claiming counts an attempt, so an event that keeps failing eventually stops being claimed
 * rather than holding up everything behind it. A failed batch stays unsent and is retried by
 * the next run.
 */
export async function dispatchOutbox(store: OutboxStore, send: SendEvents, limit = 50): Promise<DispatchResult> {
  const events = await store.claim(limit);
  if (events.length === 0) return { sent: 0, failed: 0 };

  const ids = events.map((event) => event.id);
  try {
    await send(events.map((event) => ({ name: event.name, data: event.payload })));
  } catch (error) {
    await store.markFailed(ids, error instanceof Error ? error.message : 'The job runner refused the events.');
    return { sent: 0, failed: events.length };
  }

  await store.markSent(ids);
  return { sent: events.length, failed: 0 };
}
