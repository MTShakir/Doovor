import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getAccess = vi.fn();
const lessonsFromToday = vi.fn();

vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess() as unknown }));
vi.mock('@/lib/lessons/teaching', () => ({
  lessonsFromToday: (...args: unknown[]) => lessonsFromToday(...args) as unknown,
  teachingProfiles: (access: { memberships: { instructorProfileId: string | null }[] }) =>
    access.memberships.flatMap((one) => (one.instructorProfileId === null ? [] : [one.instructorProfileId])),
}));

const { GET } = await import('./route');

const lesson = {
  id: '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80',
  startsAt: '2026-09-15T08:00:00.000Z',
  endsAt: '2026-09-15T09:00:00.000Z',
  learnerName: 'Jack Taylor',
  lessonType: 'Standard lesson',
  pickup: null,
  facts: { status: 'confirmed', paymentStatus: 'unpaid', kind: 'standard', source: 'instructor' },
  recorded: false,
};

const instructor = {
  session: { userId: 'user-sarah', email: 'sarah@example.com', aal: 'aal1' },
  access: { staffRole: null, memberships: [{ businessId: 'business-1', businessType: 'independent', role: 'owner', instructorProfileId: 'profile-sarah' }] },
};

const read = (query = '') => GET(new Request(`https://app.example.com/api/v1/instructor/lessons${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-09-15T22:30:00Z'), toFake: ['Date'] });
  getAccess.mockResolvedValue(instructor);
  lessonsFromToday.mockResolvedValue([lesson]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the lessons a phone keeps for no signal (PRG-09, M4-09)', () => {
  it('sends today\'s and tomorrow\'s lessons in London, whose they are, and when they were read', async () => {
    const answer = await read();

    expect(answer.status).toBe(200);
    // Half past eleven at night in London on the 15th: still the 15th there.
    expect(await answer.json()).toEqual({
      ok: true,
      data: { owner: 'user-sarah', days: ['2026-09-15', '2026-09-16'], at: '2026-09-15T22:30:00.000Z', lessons: [lesson] },
    });
    expect(lessonsFromToday).toHaveBeenCalledWith(['profile-sarah'], 2, new Date('2026-09-15T22:30:00Z'));
    expect(answer.headers.get('cache-control')).toBe('no-store');
  });

  it('sends more days when asked, up to a week, and refuses anything else before reading a lesson', async () => {
    const three = await read('?days=3');
    expect(((await three.json()) as { data: { days: string[] } }).data.days).toEqual(['2026-09-15', '2026-09-16', '2026-09-17']);
    expect((await read('?days=8')).status).toBe(422);
    expect((await read('?days=soon')).status).toBe(422);
    expect(lessonsFromToday).toHaveBeenCalledTimes(1);
  });

  it('gives somebody who teaches nowhere no lessons, rather than a refusal', async () => {
    getAccess.mockResolvedValue({ ...instructor, access: { staffRole: null, memberships: [] } });
    lessonsFromToday.mockResolvedValue([]);
    const answer = await read();
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ ok: true, data: { lessons: [] } });
  });

  it('sends nothing to somebody signed out, or to a school owner who has not passed the second step', async () => {
    getAccess.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);

    getAccess.mockResolvedValueOnce({
      session: { userId: 'user-david', email: null, aal: 'aal1' },
      access: { staffRole: null, memberships: [{ businessId: 'school-1', businessType: 'school', role: 'owner', instructorProfileId: 'profile-david' }] },
    });
    const owner = await read();
    expect(owner.status).toBe(403);
    expect(await owner.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    expect(lessonsFromToday).not.toHaveBeenCalled();
  });

  it('answers a failed read as a failure, never as a day with no lessons', async () => {
    lessonsFromToday.mockRejectedValue(new Error('connection lost'));
    const answer = await read();
    expect(answer.status).toBe(500);
    expect(await answer.json()).toEqual({ ok: false, code: 'UNKNOWN', message: 'Something went wrong. Try again.' });
  });
});
