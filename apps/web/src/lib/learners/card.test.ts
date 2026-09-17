import { beforeEach, describe, expect, it, vi } from 'vitest';

const limit = vi.fn();
const eq = vi.fn(() => ({ limit }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ from }) }));

const { mayReadLearner } = await import('./card');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('whether somebody may see a learner at all (NFR-SEC-01, D-131)', () => {
  it('lets a learner see themselves without asking the database', async () => {
    expect(await mayReadLearner('learner-1', 'learner-1')).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it('goes by whether the policies let them read any of the learner links', async () => {
    limit.mockResolvedValueOnce({ data: [{ id: 'link-1' }], error: null });
    expect(await mayReadLearner('learner-1', 'owner-1')).toBe(true);
    expect(from).toHaveBeenCalledWith('learner_relationships');
    expect(eq).toHaveBeenCalledWith('learner_id', 'learner-1');

    limit.mockResolvedValueOnce({ data: [], error: null });
    expect(await mayReadLearner('learner-2', 'owner-1')).toBe(false);
  });

  it('fails loudly rather than saying nobody may see them', async () => {
    limit.mockResolvedValueOnce({ data: null, error: new Error('connection lost') });
    await expect(mayReadLearner('learner-1', 'owner-1')).rejects.toThrow('connection lost');
  });
});
