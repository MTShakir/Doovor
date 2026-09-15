// IndexedDB for Node, set up before Dexie looks for it.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { outboxFor, putInOutbox, removeFromOutbox, sendOutbox } from './outbox';

const record = (id: string, owner = 'user-emma') => ({
  id,
  owner,
  bookingId: `booking-${id}`,
  learnerName: 'Amelia Evans',
  lessonStartsAt: '2026-09-15T12:00:00.000Z',
  body: {
    id,
    bookingId: `booking-${id}`,
    ratings: [{ skillCode: 'JUNCTIONS' as const, rating: 3 }],
    summary: 'Good junctions today',
  },
});

/** A fetch that answers each record in turn with these statuses. */
const answering = (...statuses: (number | 'no signal')[]) => {
  const fetcher = vi.fn<typeof fetch>();
  for (const status of statuses) {
    if (status === 'no signal') fetcher.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else fetcher.mockResolvedValueOnce(Response.json({ ok: status < 300, message: `Answer ${String(status)}` }, { status }));
  }
  return fetcher;
};

const minute = (n: number) => new Date(Date.UTC(2026, 8, 15, 12, n));

beforeEach(async () => {
  for (const owner of ['user-emma', 'user-sarah']) {
    for (const one of await outboxFor(owner)) await removeFromOutbox(one.id);
  }
});

describe('the outbox of lesson records saved on the phone (PRG-09, M4-11)', () => {
  it('keeps a saved record to be sent, once however often it is saved', async () => {
    await putInOutbox(record('a'), minute(1));
    await putInOutbox({ ...record('a'), learnerName: 'Somebody else' }, minute(2));
    expect(await outboxFor('user-emma')).toEqual([
      expect.objectContaining({ id: 'a', state: 'waiting', learnerName: 'Amelia Evans', savedAt: minute(1).toISOString(), attempts: 0 }),
    ]);
  });

  it('sends each waiting record oldest first, as the route takes it, and takes a saved one out', async () => {
    await putInOutbox(record('later'), minute(5));
    await putInOutbox(record('first'), minute(1));
    const fetcher = answering(201, 200);

    const report = await sendOutbox('user-emma', fetcher);

    expect(report).toEqual({ sent: ['first', 'later'], conflicts: [], refused: [], waiting: [] });
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init?.body as string) as { id: string })).toEqual([
      expect.objectContaining({ id: 'first', bookingId: 'booking-first', summary: 'Good junctions today' }),
      expect.objectContaining({ id: 'later' }),
    ]);
    expect(fetcher).toHaveBeenCalledWith('/api/v1/lesson-records', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
    // Already saved, from this phone's earlier try, is as good as saved: no second record, nothing left.
    expect(await outboxFor('user-emma')).toEqual([]);
  });

  it('keeps a record waiting with no signal, while signed out, or when the server cannot answer', async () => {
    await putInOutbox(record('a'), minute(1));
    await putInOutbox(record('b'), minute(2));
    await putInOutbox(record('c'), minute(3));

    const report = await sendOutbox('user-emma', answering('no signal', 401, 503), minute(9));

    expect(report.waiting).toEqual(['a', 'b', 'c']);
    expect(await outboxFor('user-emma')).toEqual(
      ['a', 'b', 'c'].map((id): unknown => expect.objectContaining({ id, state: 'waiting', attempts: 1, lastTriedAt: minute(9).toISOString() })),
    );
  });

  it('keeps a lesson recorded from another phone as a conflict to show, and a refusal with what the server said', async () => {
    await putInOutbox(record('elsewhere'), minute(1));
    await putInOutbox(record('wrong'), minute(2));

    const report = await sendOutbox('user-emma', answering(409, 422));

    expect(report).toEqual({ sent: [], conflicts: ['elsewhere'], refused: ['wrong'], waiting: [] });
    expect(await outboxFor('user-emma')).toEqual([
      expect.objectContaining({ id: 'elsewhere', state: 'conflict', message: 'Answer 409' }),
      expect.objectContaining({ id: 'wrong', state: 'refused', message: 'Answer 422' }),
    ]);

    // Neither is sent again: sending again cannot change either answer.
    const again = answering();
    expect(await sendOutbox('user-emma', again)).toEqual({ sent: [], conflicts: [], refused: [], waiting: [] });
    expect(again).not.toHaveBeenCalled();
  });

  it('only ever sends a record under the name of whoever saved it', async () => {
    await putInOutbox(record('emmas'), minute(1));
    await putInOutbox(record('sarahs', 'user-sarah'), minute(2));
    const fetcher = answering(201);

    expect((await sendOutbox('user-sarah', fetcher)).sent).toEqual(['sarahs']);
    expect((await outboxFor('user-emma')).map((one) => one.id)).toEqual(['emmas']);
  });
});
