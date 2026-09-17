import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { learnerAllocation } = await import('./allocation');

function instructor(overrides: Record<string, unknown>) {
  return {
    instructor_id: 'p-1',
    name: 'Emma Clarke',
    badge: 'checked',
    transmission: 'automatic',
    distance_miles: 1.94,
    radius_miles: 8,
    open_minutes: 2400,
    free_minutes: 420,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('who could teach a learner (SCH-03, M5-14)', () => {
  it('reads the facts, suggests in order with reasons, and lists everybody by the name the database gives', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        learner: { transmission: 'automatic', outcode: 'M13' },
        instructors: [
          instructor({}),
          instructor({ instructor_id: 'p-2', name: 'Tom Walsh', transmission: 'manual', free_minutes: 2000 }),
          instructor({ instructor_id: 'p-3', name: 'Zara Ahmed', transmission: 'both', distance_miles: 0.8, free_minutes: 1500 }),
        ],
      },
      error: null,
    });

    const allocation = await learnerAllocation('school-1', 'learner-1');
    expect(rpc).toHaveBeenCalledWith('learner_allocation', { p_business_id: 'school-1', p_learner_id: 'learner-1' });
    expect(allocation.suggestions.map((one) => one.name)).toEqual(['Zara Ahmed', 'Emma Clarke']);
    expect(allocation.suggestions[1]?.reasons).toEqual(['Covers M13, 1.9 miles away', '7 free hours in the next 2 weeks', 'Teaches automatic']);
    expect(allocation.everybody).toEqual([
      { id: 'p-1', name: 'Emma Clarke' },
      { id: 'p-2', name: 'Tom Walsh' },
      { id: 'p-3', name: 'Zara Ahmed' },
    ]);
  });

  it('fails loudly rather than suggesting nobody when the facts cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(learnerAllocation('school-1', 'learner-1')).rejects.toThrow('Could not read who could teach this learner: NOT_ALLOWED');

    rpc.mockResolvedValueOnce({ data: { learner: { transmission: null, outcode: null }, instructors: [instructor({ badge: 'maybe' })] }, error: null });
    await expect(learnerAllocation('school-1', 'learner-1')).rejects.toThrow();
  });
});
