// IndexedDB for Node, set up before Dexie looks for it.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outboxFor, removeFromOutbox } from './outbox';
import { saveRecord, type SaveDependencies } from './save-record';

const body = {
  id: '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80',
  bookingId: '0b7e2c1a-9d4f-4a3b-8c2d-1e0f9a8b7c6d',
  ratings: [{ skillCode: 'JUNCTIONS' as const, rating: 3 }],
  summary: 'Good junctions today',
};
const lesson = { id: body.bookingId, learnerName: 'Amelia Evans', startsAt: '2026-09-15T12:00:00.000Z' };

const answer = (status: number, message = 'Answer') => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: status < 300, message }, { status }));
const noSignal = () => vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

const on = (fetcher: typeof fetch, owner: string | null = 'user-emma'): SaveDependencies & { askForSync: ReturnType<typeof vi.fn> } => ({
  owner: () => Promise.resolve(owner),
  fetcher,
  askForSync: vi.fn(() => Promise.resolve()),
});

beforeEach(async () => {
  for (const one of await outboxFor('user-emma')) await removeFromOutbox(one.id);
});

describe('saving a lesson record (PRG-01, PRG-09, M4-11)', () => {
  it('sends it at once with signal, and nothing is left on the phone', async () => {
    const device = on(answer(201));
    expect(await saveRecord(body, lesson, device)).toEqual({ kind: 'saved' });
    expect(await outboxFor('user-emma')).toEqual([]);
    expect(device.askForSync).not.toHaveBeenCalled();
  });

  it('keeps it on the phone with no signal, and asks for it to be sent when the signal is back', async () => {
    const device = on(noSignal());
    expect(await saveRecord(body, lesson, device)).toEqual({ kind: 'kept' });
    expect(await outboxFor('user-emma')).toEqual([
      expect.objectContaining({ id: body.id, bookingId: body.bookingId, learnerName: 'Amelia Evans', state: 'waiting', body }),
    ]);
    expect(device.askForSync).toHaveBeenCalledTimes(1);
  });

  it('says so when the lesson was already recorded elsewhere, or the server turned it down, and leaves nothing to send', async () => {
    expect(await saveRecord(body, lesson, on(answer(409)))).toEqual({ kind: 'conflict' });
    expect(await saveRecord(body, lesson, on(answer(422, 'Write a line about the lesson')))).toEqual({
      kind: 'refused',
      message: 'Write a line about the lesson',
    });
    expect(await outboxFor('user-emma')).toEqual([]);
  });

  it('sends it straight away on a phone that has never read whose lessons it keeps', async () => {
    const fetcher = answer(201);
    expect(await saveRecord(body, lesson, on(fetcher, null))).toEqual({ kind: 'saved' });
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toEqual(body);
    expect(await saveRecord(body, lesson, on(noSignal(), null))).toEqual({ kind: 'unsent' });
    expect(await saveRecord(body, lesson, on(answer(409), null))).toEqual({ kind: 'conflict' });
  });
});
