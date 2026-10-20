import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const refuseWhileViewing = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));

const { answerMove } = await import('./move-actions');

const moveId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ session: { userId: 'learner-1' } });
  refuseWhileViewing.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("a learner's choice to move, or not (M9-23, M9-24, D-292)", () => {
  it('moves, or stays, as the learner says', async () => {
    expect(await answerMove({ moveId, move: true })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('answer_learner_move', { p_move_id: moveId, p_move: true });
    await answerMove({ moveId, move: false });
    expect(rpc).toHaveBeenLastCalledWith('answer_learner_move', { p_move_id: moveId, p_move: false });
  });

  it('says when it was answered already, and refuses what is not a choice', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "answered"}' } });
    expect(await answerMove({ moveId, move: true })).toMatchObject({ ok: false, message: 'You have already answered this.' });
    expect(await answerMove({ moveId: 'nope', move: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('is not answered by somebody only looking', async () => {
    refuseWhileViewing.mockResolvedValueOnce({ ok: false, code: 'NOT_ALLOWED', message: 'You are viewing as somebody else.' });
    expect(await answerMove({ moveId, move: true })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
