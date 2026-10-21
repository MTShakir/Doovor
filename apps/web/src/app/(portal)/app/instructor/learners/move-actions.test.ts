import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const refuseWhileViewing = vi.fn<() => Promise<unknown>>();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { answerMoveFor } = await import('./move-actions');

const moveId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ session: { userId: 'instructor-1' } });
  refuseWhileViewing.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('an instructor answering for a learner who has never signed in (M9-23, D-322)', () => {
  it('says what the learner chose, and shows the list again', async () => {
    expect(await answerMoveFor({ moveId, move: true })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('answer_learner_move_for', { p_move_id: moveId, p_move: true });
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor/learners');
    await answerMoveFor({ moveId, move: false });
    expect(rpc).toHaveBeenLastCalledWith('answer_learner_move_for', { p_move_id: moveId, p_move: false });
  });

  it('says why the database would not take it', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "answered"}' } });
    expect(await answerMoveFor({ moveId, move: true })).toMatchObject({ ok: false, message: 'This has been answered already.' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "can_answer"}' } });
    expect(await answerMoveFor({ moveId, move: true })).toMatchObject({ ok: false, message: 'They have signed in, so they answer for themselves.' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_FOUND' } });
    expect(await answerMoveFor({ moveId, move: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses what is not a choice, and anybody only looking', async () => {
    expect(await answerMoveFor({ moveId: 'nope', move: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    refuseWhileViewing.mockResolvedValueOnce({ ok: false, code: 'NOT_ALLOWED', message: 'You are viewing as somebody else.' });
    expect(await answerMoveFor({ moveId, move: true })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
