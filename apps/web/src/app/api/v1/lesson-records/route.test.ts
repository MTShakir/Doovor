import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const getSession = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ getSession: () => getSession() as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => { revalidatePath(...args); } }));

const { POST } = await import('./route');

const id = '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80';
const bookingId = '0b7e2c1a-9d4f-4a3b-8c2d-1e0f9a8b7c6d';
const record = {
  id,
  bookingId,
  ratings: [
    { skillCode: 'JUNCTIONS', rating: 3 },
    { skillCode: 'MIRRORS', rating: 4 },
  ],
  summary: 'Good junctions today',
  nextFocus: 'Roundabouts',
  secondsTaken: 41,
};

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('https://app.example.com/api/v1/lesson-records', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.com', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ userId: 'instructor-1' });
  rpc.mockResolvedValue({ data: { id, saved: true, completed: false }, error: null });
});

describe('saving a lesson record from the phone (PRG-01, PRG-09, M4-05)', () => {
  it('saves it through the database function, as the signed-in instructor, and says it did', async () => {
    const answer = await send(record);

    expect(answer.status).toBe(201);
    expect(await answer.json()).toEqual({ ok: true, data: { id, saved: true, completed: false } });
    expect(rpc).toHaveBeenCalledWith('save_lesson_record', {
      p_id: id,
      p_booking_id: bookingId,
      p_ratings: [
        { skill_code: 'JUNCTIONS', rating: 3 },
        { skill_code: 'MIRRORS', rating: 4 },
      ],
      p_summary: 'Good junctions today',
      p_next_focus: 'Roundabouts',
      p_homework: undefined,
      p_seconds_taken: 41,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor');
    expect(answer.headers.get('cache-control')).toBe('no-store');
  });

  it('answers a record sent again as already saved, which the outbox takes as done', async () => {
    rpc.mockResolvedValue({ data: { id, saved: false, completed: false }, error: null });
    const answer = await send(record);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ ok: true, data: { saved: false } });
  });

  it('refuses another device\'s record for the same lesson as a conflict', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ALREADY_RECORDED' } });
    const answer = await send(record);
    expect(answer.status).toBe(409);
    expect(await answer.json()).toEqual({ ok: false, code: 'ALREADY_RECORDED', message: 'This lesson already has a lesson record.' });
  });

  it('passes on what the database refused, with a status that says whether trying again could help', async () => {
    const cases: [string, string, number][] = [
      ['42501', 'NOT_FOUND', 404],
      ['P0001', 'TOO_CLOSE', 422],
      ['P0001', 'VALIDATION_FAILED', 422],
      ['08006', 'connection failure', 500],
    ];
    for (const [code, message, status] of cases) {
      rpc.mockResolvedValueOnce({ data: null, error: { code, message } });
      expect((await send(record)).status, message).toBe(status);
    }
  });

  it('says what is wrong with a record before asking the database anything', async () => {
    const answer = await send({ ...record, ratings: [] });
    expect(answer.status).toBe(422);
    expect(await answer.json()).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: 'Tap at least one skill you covered' });
    expect((await send('not json')).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('saves nothing for somebody who is not signed in', async () => {
    getSession.mockResolvedValue(null);
    const answer = await send(record);
    expect(answer.status).toBe(401);
    expect(await answer.json()).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('takes records only from this app, as JSON', async () => {
    expect((await send(record, { origin: 'https://elsewhere.example.com' })).status).toBe(403);
    expect((await send(record, { 'content-type': 'text/plain' })).status).toBe(403);
    // A browser that leaves the origin off a same-origin request still says where it came from.
    const sameSite = new Request('https://app.example.com/api/v1/lesson-records', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify(record),
    });
    expect((await POST(sameSite)).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
