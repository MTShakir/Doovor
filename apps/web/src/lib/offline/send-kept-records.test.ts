// IndexedDB for Node, set up before Dexie looks for it.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { outboxFor, putInOutbox, removeFromOutbox } from './outbox';
import { outboxChannel, sendKeptRecords } from './send-kept-records';

const record = (id: string) => ({
  id,
  owner: 'user-emma',
  bookingId: `booking-${id}`,
  learnerName: 'Amelia Evans',
  lessonStartsAt: '2026-09-15T12:00:00.000Z',
  body: { id, bookingId: `booking-${id}`, ratings: [{ skillCode: 'CTRL' as const, rating: 2 }], summary: 'Moving off' },
});

const saved = () => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }, { status: 201 }));

let heard: unknown[] = [];
let listener: BroadcastChannel;

beforeEach(async () => {
  for (const one of await outboxFor('user-emma')) await removeFromOutbox(one.id);
  heard = [];
  listener = new BroadcastChannel(outboxChannel);
  listener.onmessage = (event: MessageEvent) => {
    heard.push(event.data);
  };
});

afterEach(() => {
  listener.close();
});

/** A lock manager with one lock, held by somebody else or free; waiting for it gets it once they are done. */
const locks = (held: boolean) =>
  ({
    request: (_name: string, optionsOrCallback: LockOptions | ((lock: Lock | null) => unknown), maybeCallback?: (lock: Lock | null) => unknown) => {
      const lock = { name: 'lesson-outbox', mode: 'exclusive' as const };
      if (typeof optionsOrCallback === 'function') return Promise.resolve(optionsOrCallback(lock));
      return Promise.resolve(maybeCallback?.(held ? null : lock));
    },
  }) as unknown as LockManager;

describe('sending the records kept on the phone (PRG-09, M4-11)', () => {
  it('sends the waiting records and tells every screen on the device', async () => {
    await putInOutbox(record('a'));
    const report = await sendKeptRecords('user-emma', { locks: locks(false), fetcher: saved() });
    expect(report?.sent).toEqual(['a']);
    await vi.waitFor(() => {
      expect(heard).toEqual([{ type: 'changed' }]);
    });
  });

  it('leaves the sending to whoever on the device already is', async () => {
    await putInOutbox(record('a'));
    const fetcher = saved();
    expect(await sendKeptRecords('user-emma', { locks: locks(true), fetcher })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await outboxFor('user-emma')).toHaveLength(1);
  });

  it('waits for whoever is sending, when a record just saved has to know how it went', async () => {
    await putInOutbox(record('a'));
    const report = await sendKeptRecords('user-emma', { locks: locks(true), wait: true, fetcher: saved() });
    expect(report?.sent).toEqual(['a']);
  });

  it('says nothing when nothing changed, as with no signal', async () => {
    await putInOutbox(record('a'));
    await sendKeptRecords('user-emma', { fetcher: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')) });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heard).toEqual([]);
  });
});
