import { statsRange } from '@repo/core/stats-range';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { arrivalsCount, arrivalsStep, platformHighlights } = await import('./highlights');

const range = statsRange('last_30_days', '2026-09-20');

const lists = {
  earning_schools: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Quayside Driving School', pence: 420_000, payments: 96 }],
  earning_instructors: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Sarah Khan Driving', pence: 180_000, payments: 40 }],
  busiest_schools: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Quayside Driving School', learners: 31, lessons: 96 }],
  busiest_instructors: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Sarah Khan Driving', learners: 12, lessons: 40 }],
  joined: [{ id: '33333333-3333-4333-8333-333333333333', name: 'New Wheels', type: 'school', joined_at: '2026-09-18T09:00:00+00:00' }],
  more: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('who stands out on the platform (ADM-01, D-172)', () => {
  it('asks for the same days as the figures, and as many arrivals as are shown', async () => {
    rpc.mockResolvedValueOnce({ data: lists, error: null });
    const highlights = await platformHighlights(range, 10);

    expect(rpc).toHaveBeenCalledWith('platform_highlights', {
      p_from: '2026-08-21T23:00:00.000Z',
      p_to: '2026-09-20T23:00:00.000Z',
      p_joined: 10,
    });
    expect(highlights.earningSchools[0]).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Quayside Driving School',
      pence: 420_000,
      payments: 96,
    });
    expect(highlights.busiestInstructors[0]?.learners).toBe(12);
    expect(highlights.arrivals).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', name: 'New Wheels', kind: 'school', joined: 'Fri 18 Sep 2026' },
    ]);
    expect(highlights.more).toBe(true);
  });

  it('fails loudly rather than showing empty lists when they cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(platformHighlights(range, 5)).rejects.toThrow('Could not read the platform lists: NOT_ALLOWED');
  });

  it('refuses lists that are not the shape it expects', async () => {
    rpc.mockResolvedValueOnce({ data: { ...lists, more: 'yes' }, error: null });
    await expect(platformHighlights(range, 5)).rejects.toThrow();
  });

  it('shows five arrivals to begin with, and more only in fives up to fifty', () => {
    expect(arrivalsStep).toBe(5);
    expect(arrivalsCount(undefined)).toBe(5);
    expect(arrivalsCount('10')).toBe(10);
    expect(arrivalsCount('50')).toBe(50);
    // Anything else is somebody typing in the address.
    expect(arrivalsCount('7')).toBe(5);
    expect(arrivalsCount('0')).toBe(5);
    expect(arrivalsCount('-5')).toBe(5);
    expect(arrivalsCount('many')).toBe(5);
    expect(arrivalsCount('500')).toBe(50);
  });
});
