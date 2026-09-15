// IndexedDB for Node, set up before Dexie looks for it.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TeachingLesson } from '@/lib/lessons/teaching';
import { forgetKeptDays, keepDays, keptDay, keptLesson, keptOwner, type KeptDaysAnswer } from './kept-days';

const lesson = (id: string, startsAt: string, learnerName = 'Jack Taylor'): TeachingLesson => ({
  id,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  learnerName,
  lessonType: 'Standard lesson',
  pickup: { label: 'Home', address: '1 Park Lane', postcode: 'LS2 9JT' },
  facts: { status: 'confirmed', paymentStatus: 'unpaid', kind: 'standard', source: 'instructor' },
  recorded: false,
});

/** A fetch that answers the kept lessons route with this. */
const answering = (data: KeptDaysAnswer) =>
  vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, data }));

const sarah: KeptDaysAnswer = {
  owner: 'user-sarah',
  days: ['2026-09-15', '2026-09-16'],
  at: '2026-09-15T07:30:00.000Z',
  lessons: [
    lesson('b', '2026-09-15T13:00:00.000Z', 'Noah Wilson'),
    lesson('a', '2026-09-15T08:00:00.000Z'),
    // Half past eleven at night in London on the 16th is the 16th, whatever the UTC date says.
    lesson('c', '2026-09-16T22:30:00.000Z', 'Olivia Brown'),
  ],
};

beforeEach(async () => {
  await forgetKeptDays();
});

describe('the lessons a phone keeps for no signal (PRG-09, M4-09)', () => {
  it('keeps today\'s and tomorrow\'s lessons, each under its day in London, with whose they are and when they were read', async () => {
    const fetcher = answering(sarah);
    expect(await keepDays(fetcher)).toBe('kept');
    expect(fetcher).toHaveBeenCalledWith('/api/v1/instructor/lessons', expect.objectContaining({ cache: 'no-store' }));

    const today = await keptDay('2026-09-15');
    expect(today.lessons.map((one) => one.id)).toEqual(['a', 'b']);
    expect(today).toMatchObject({ owner: 'user-sarah', at: '2026-09-15T07:30:00.000Z', covered: true });
    expect(today.lessons[0]).toMatchObject({ learnerName: 'Jack Taylor', pickup: { label: 'Home' }, day: '2026-09-15' });

    // The last lesson of the 16th starts on the 17th in UTC, and is still the 16th's.
    expect((await keptDay('2026-09-16')).lessons.map((one) => one.id)).toEqual(['c']);
  });

  it('puts a fresh copy in place of the kept one: a lesson moved away or called off is gone', async () => {
    await keepDays(answering(sarah));
    await keepDays(answering({ ...sarah, at: '2026-09-15T09:00:00.000Z', lessons: [lesson('a', '2026-09-15T08:00:00.000Z')] }));

    const today = await keptDay('2026-09-15');
    expect(today.lessons.map((one) => one.id)).toEqual(['a']);
    expect(today.at).toBe('2026-09-15T09:00:00.000Z');
  });

  it('keeps what it had when there is no connection, or the answer is a refusal', async () => {
    await keepDays(answering(sarah));

    expect(await keepDays(vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))).toBe('offline');
    expect(await keepDays(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, code: 'UNKNOWN' }, { status: 500 })))).toBe('refused');
    expect(await keepDays(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: false, code: 'NOT_AUTHENTICATED' }, { status: 401 })))).toBe('refused');

    expect((await keptDay('2026-09-15')).lessons).toHaveLength(2);
  });

  it('finds one kept lesson by its id, and nothing for a lesson it does not have', async () => {
    await keepDays(answering(sarah));
    expect(await keptLesson('c')).toMatchObject({ learnerName: 'Olivia Brown', day: '2026-09-16' });
    expect(await keptLesson('elsewhere')).toBeNull();
  });

  it('tells a day with no lessons from a day it has never read', async () => {
    await keepDays(answering({ ...sarah, lessons: [] }));
    expect(await keptDay('2026-09-16')).toMatchObject({ lessons: [], covered: true });
    expect(await keptDay('2026-09-17')).toMatchObject({ lessons: [], covered: false });
  });

  it('forgets everything, whose and when included, for the next person to sign in', async () => {
    await keepDays(answering(sarah));
    expect(await keptOwner()).toBe('user-sarah');
    await forgetKeptDays();
    expect(await keptDay('2026-09-15')).toEqual({ lessons: [], owner: null, at: null, covered: false });
    expect(await keptOwner()).toBeNull();
  });
});
