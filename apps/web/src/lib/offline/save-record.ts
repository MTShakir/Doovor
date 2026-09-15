import type { LessonRecordInput } from '@repo/core/schemas/lesson-record';
import type { TeachingLesson } from '@/lib/lessons/teaching';
import { keptOwner } from './kept-days';
import { outboxFor, putInOutbox, removeFromOutbox } from './outbox';
import { sendKeptRecords, sendWhenSignalReturns } from './send-kept-records';

/** What became of a saved lesson record. */
export type SaveOutcome =
  /** On the server. */
  | { kind: 'saved' }
  /** On the phone, and sent when there is signal. */
  | { kind: 'kept' }
  /** The lesson already had a record from another phone or tab. */
  | { kind: 'conflict' }
  | { kind: 'refused'; message: string | null }
  /** Neither sent nor kept: storage refused it and there is no signal. */
  | { kind: 'unsent' };

export interface SaveDependencies {
  owner: () => Promise<string | null>;
  fetcher: typeof fetch;
  locks?: LockManager;
  askForSync: () => Promise<void>;
}

const onThisDevice = (): SaveDependencies => ({
  owner: keptOwner,
  fetcher: fetch,
  locks: typeof navigator === 'undefined' ? undefined : navigator.locks,
  askForSync: sendWhenSignalReturns,
});

/** Sends a record straight to the server, as the app did before it could keep one. */
async function sendStraight(body: LessonRecordInput, fetcher: typeof fetch): Promise<SaveOutcome> {
  let response: Response;
  try {
    response = await fetcher('/api/v1/lesson-records', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: 'unsent' };
  }
  if (response.ok) return { kind: 'saved' };
  if (response.status === 409) return { kind: 'conflict' };
  if (response.status >= 500) return { kind: 'unsent' };
  const answer = (await response.json().catch(() => null)) as { message?: string } | null;
  return { kind: 'refused', message: answer?.message ?? null };
}

/**
 * Saves a lesson record (PRG-01, PRG-09, M4-11): into the outbox on the phone first, then sent. A
 * record the server turns down leaves the outbox, since the instructor is looking at why and the
 * draft is still there to change. One that cannot be sent yet stays, and the browser is asked to
 * send it once the signal is back. A phone that cannot keep it, or has never read whose lessons it
 * keeps, sends it straight away instead.
 */
export async function saveRecord(
  body: LessonRecordInput,
  lesson: Pick<TeachingLesson, 'id' | 'learnerName' | 'startsAt'>,
  dependencies: SaveDependencies = onThisDevice(),
): Promise<SaveOutcome> {
  const owner = await dependencies.owner().catch(() => null);
  if (owner === null) return sendStraight(body, dependencies.fetcher);

  try {
    await putInOutbox({ id: body.id, owner, bookingId: lesson.id, learnerName: lesson.learnerName, lessonStartsAt: lesson.startsAt, body });
  } catch {
    return sendStraight(body, dependencies.fetcher);
  }

  const report = await sendKeptRecords(owner, { locks: dependencies.locks, wait: true, fetcher: dependencies.fetcher });
  if (report?.sent.includes(body.id) === true) return { kind: 'saved' };
  if (report?.conflicts.includes(body.id) === true || report?.refused.includes(body.id) === true) {
    const kept = (await outboxFor(owner)).find((one) => one.id === body.id);
    await removeFromOutbox(body.id);
    return kept?.state === 'conflict' ? { kind: 'conflict' } : { kind: 'refused', message: kept?.message ?? null };
  }
  await dependencies.askForSync();
  return { kind: 'kept' };
}
