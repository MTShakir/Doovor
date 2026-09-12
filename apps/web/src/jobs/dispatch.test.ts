import { describe, expect, it, vi } from 'vitest';
import { dispatchOutbox, type OutboxEvent, type OutboxStore } from './dispatch';

function fakeStore(pending: OutboxEvent[]) {
  const marked = { sent: [] as string[], failed: [] as { ids: string[]; error: string }[] };
  const store: OutboxStore = {
    claim: (limit) => Promise.resolve(pending.slice(0, limit)),
    markSent: (ids) => {
      marked.sent.push(...ids);
      return Promise.resolve();
    },
    markFailed: (ids, error) => {
      marked.failed.push({ ids, error });
      return Promise.resolve();
    },
  };
  return { store, marked };
}

const booking: OutboxEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'booking/confirmed',
  payload: { booking_id: '22222222-2222-4222-8222-222222222222' },
  attempts: 1,
};

describe('outbox dispatcher (M1-01, D-017)', () => {
  it('sends what it claimed and marks it sent', async () => {
    const { store, marked } = fakeStore([booking]);
    const send = vi.fn(() => Promise.resolve());

    const result = await dispatchOutbox(store, send);

    expect(send).toHaveBeenCalledWith([{ name: 'booking/confirmed', data: booking.payload }]);
    expect(marked.sent).toEqual([booking.id]);
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it('does not call the job runner when nothing is waiting', async () => {
    const { store, marked } = fakeStore([]);
    const send = vi.fn(() => Promise.resolve());

    expect(await dispatchOutbox(store, send)).toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(marked.sent).toEqual([]);
  });

  it('records why a send failed and leaves the event waiting', async () => {
    const { store, marked } = fakeStore([booking]);
    const send = vi.fn(() => Promise.reject(new Error('connection refused')));

    const result = await dispatchOutbox(store, send);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(marked.sent).toEqual([]);
    expect(marked.failed).toEqual([{ ids: [booking.id], error: 'connection refused' }]);
  });

  it('never claims more than the limit it was given', async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ ...booking, id: `id-${String(index)}` }));
    const { store } = fakeStore(many);
    const send = vi.fn(() => Promise.resolve());

    expect(await dispatchOutbox(store, send, 2)).toEqual({ sent: 2, failed: 0 });
    expect(send).toHaveBeenCalledWith([
      { name: 'booking/confirmed', data: booking.payload },
      { name: 'booking/confirmed', data: booking.payload },
    ]);
  });
});
