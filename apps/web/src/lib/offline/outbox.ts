import type { LessonRecordInput } from '@repo/core/schemas/lesson-record';
import Dexie, { type EntityTable } from 'dexie';

/**
 * Lesson records saved on the phone and not yet on the server (PRG-09, PRD 8.1, M4-11).
 *
 * A record goes here the moment it is saved, before it is sent, so closing the app half way through
 * sending loses nothing. Its id was made on the phone when the draft started, and the server saves
 * one record for one id however often it arrives (D-100), so sending again is always safe. The same
 * code sends from a page and from the service worker, which is why it holds no framework.
 *
 * The outbox is not cleared at sign in: a record somebody saved with no signal is theirs to send
 * when they are back, and it is only sent under their own name.
 */

export type OutboxState =
  /** Saved on the phone, to be sent. */
  | 'waiting'
  /** The lesson already had a record from another phone or tab, so this one was not saved. */
  | 'conflict'
  /** Refused for a reason sending again will not change. */
  | 'refused';

export interface OutboxRecord {
  /** The record's own id, made on the phone. */
  id: string;
  /** Who saved it: it is only ever sent while they are the one signed in. */
  owner: string;
  bookingId: string;
  /** For the phone's screens: who and when, without the server. */
  learnerName: string;
  lessonStartsAt: string;
  /** Exactly what the route takes. */
  body: LessonRecordInput;
  state: OutboxState;
  /** What the server said, for a conflict or a refusal. */
  message: string | null;
  savedAt: string;
  attempts: number;
  lastTriedAt: string | null;
}

type OutboxStore = Dexie & { records: EntityTable<OutboxRecord, 'id'> };

let store: OutboxStore | null = null;

function outboxStore(): OutboxStore {
  if (store === null) {
    const opened = new Dexie('lesson-outbox') as OutboxStore;
    opened.version(1).stores({ records: 'id, owner, bookingId, state' });
    store = opened;
  }
  return store;
}

/** Puts a saved record in the outbox, to be sent. Saving the same record again changes nothing. */
export async function putInOutbox(record: Omit<OutboxRecord, 'state' | 'message' | 'savedAt' | 'attempts' | 'lastTriedAt'>, now = new Date()): Promise<void> {
  const db = outboxStore();
  await db.transaction('rw', db.records, async () => {
    if ((await db.records.get(record.id)) !== undefined) return;
    await db.records.put({ ...record, state: 'waiting', message: null, savedAt: now.toISOString(), attempts: 0, lastTriedAt: null });
  });
}

/** One person's records still in the outbox, the oldest saved first. */
export async function outboxFor(owner: string): Promise<OutboxRecord[]> {
  return (await outboxStore().records.where('owner').equals(owner).toArray()).sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

/** Takes a record out of the outbox: sent, or a conflict or refusal somebody has read. */
export async function removeFromOutbox(id: string): Promise<void> {
  await outboxStore().records.delete(id);
}

export interface SendReport {
  sent: string[];
  conflicts: string[];
  refused: string[];
  /** Still waiting: no signal, or the server could not answer. */
  waiting: string[];
}

/** How the route's answer decides what happens to a record (apps/web/src/app/api/v1/lesson-records/route.ts). */
function outcomeOf(status: number): 'sent' | 'conflict' | 'refused' | 'waiting' {
  if (status === 200 || status === 201) return 'sent';
  if (status === 409) return 'conflict';
  // Signed out, or the server could not answer: the same record may well go through later.
  if (status === 401 || status >= 500) return 'waiting';
  return 'refused';
}

/**
 * Sends one person's waiting records, oldest first, and records what became of each. Only waiting
 * records are sent; a conflict or a refusal stays for the screens to show until somebody reads it.
 */
export async function sendOutbox(owner: string, fetcher: typeof fetch = fetch, now = new Date()): Promise<SendReport> {
  const db = outboxStore();
  const report: SendReport = { sent: [], conflicts: [], refused: [], waiting: [] };

  for (const record of await outboxFor(owner)) {
    if (record.state !== 'waiting') continue;
    const tried = { attempts: record.attempts + 1, lastTriedAt: now.toISOString() };

    let response: Response;
    try {
      response = await fetcher('/api/v1/lesson-records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(record.body),
      });
    } catch {
      await db.records.update(record.id, tried);
      report.waiting.push(record.id);
      continue;
    }

    const outcome = outcomeOf(response.status);
    if (outcome === 'sent') {
      await db.records.delete(record.id);
      report.sent.push(record.id);
      continue;
    }
    if (outcome === 'waiting') {
      await db.records.update(record.id, tried);
      report.waiting.push(record.id);
      continue;
    }
    const answer = (await response.json().catch(() => null)) as { message?: string } | null;
    await db.records.update(record.id, { ...tried, state: outcome, message: answer?.message ?? null });
    (outcome === 'conflict' ? report.conflicts : report.refused).push(record.id);
  }

  return report;
}
