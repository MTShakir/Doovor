import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { adminRegions } = await import('./regions');

const region = (overrides: Record<string, unknown>) => ({
  area: 'LS',
  instructors: 0,
  free_minutes: 0,
  waiting: 0,
  requests: 0,
  open: false,
  switched_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('regions for platform staff (ADM-04, PRD 4.2, M5-19)', () => {
  it('names each area, counts its free time in whole hours, and says how far it is from the rule', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        rule: { instructors: 25, hours: 150 },
        regions: [region({ area: 'LS', instructors: 21, free_minutes: 8970, waiting: 40, requests: 6, switched_at: '2026-09-14T23:40:00+00:00' })],
      },
      error: null,
    });

    expect(await adminRegions()).toEqual({
      rule: { instructors: 25, hours: 150 },
      regions: [
        {
          area: 'LS',
          label: 'LS, Leeds',
          instructors: 21,
          freeHours: 149,
          waiting: 40,
          requests: 6,
          open: false,
          switchedOn: 'Tue 15 Sep 2026',
          meetsRule: false,
          instructorsShort: 4,
          hoursShort: 1,
        },
      ],
    });
    expect(rpc).toHaveBeenCalledWith('admin_regions');
  });

  it('lists the areas ready to open first, then those open, then the rest by their instructors', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        rule: { instructors: 2, hours: 10 },
        regions: [
          region({ area: 'B', instructors: 1, waiting: 9 }),
          region({ area: 'LS', instructors: 3, free_minutes: 600, open: true }),
          region({ area: 'M', instructors: 2, free_minutes: 900 }),
          region({ area: 'S', instructors: 1, waiting: 20 }),
          region({ area: 'ZE', instructors: 4 }),
        ],
      },
      error: null,
    });
    expect((await adminRegions()).regions.map((one) => one.area)).toEqual(['M', 'LS', 'ZE', 'S', 'B']);
  });

  it('fails loudly rather than showing no regions when they cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(adminRegions()).rejects.toThrow('Could not read the regions: NOT_ALLOWED');
  });
});
