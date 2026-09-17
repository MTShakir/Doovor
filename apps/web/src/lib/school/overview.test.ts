import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { schoolOverview } = await import('./overview');

const facts = {
  lessons: { today: 2, this_week: 5 },
  revenue_month: { lessons_pence: 7200, packages_pence: 38000, refunds_pence: 1000, total_pence: 44200 },
  unpaid: { total_pence: 12600, count: 3 },
  utilisation: {
    open_minutes: 2580,
    booked_minutes: 360,
    instructors: [
      { instructor_id: 'ian', name: 'Ian', open_minutes: 1920, booked_minutes: 300 },
      { instructor_id: 'ivy', name: 'Ivy', open_minutes: 660, booked_minutes: 60 },
    ],
  },
  new_learners_month: 2,
};

// Noon on Wednesday 28 October 2026, as in the database's own test of these figures.
const now = new Date('2026-10-28T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the school overview (SCH-01, M5-12)', () => {
  it('reads the figures the database works out, and names the week and month they cover in London', async () => {
    rpc.mockResolvedValueOnce({ data: facts, error: null });
    const overview = await schoolOverview('school-1', now);

    expect(rpc).toHaveBeenCalledWith('school_overview', { p_business_id: 'school-1' });
    expect(overview).toMatchObject({
      week: { from: '2026-10-26', to: '2026-11-01', range: 'Mon 26 Oct to Sun 1 Nov' },
      month: { label: 'October' },
      lessons: { today: 2, thisWeek: 5 },
      revenueMonth: { lessonsPence: 7200, packagesPence: 38000, refundsPence: 1000, totalPence: 44200 },
      unpaid: { totalPence: 12600, count: 3 },
      utilisation: {
        openMinutes: 2580,
        bookedMinutes: 360,
        instructors: [
          { instructorId: 'ian', name: 'Ian', openMinutes: 1920, bookedMinutes: 300 },
          { instructorId: 'ivy', name: 'Ivy', openMinutes: 660, bookedMinutes: 60 },
        ],
      },
      newLearnersMonth: 2,
    });
  });

  it('has no revenue for somebody the database does not show it to', async () => {
    rpc.mockResolvedValueOnce({ data: { ...facts, revenue_month: null }, error: null });
    expect((await schoolOverview('school-1', now)).revenueMonth).toBeNull();
  });

  it('fails loudly rather than showing a quiet week when the figures cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    await expect(schoolOverview('school-1', now)).rejects.toThrow('Could not read the school overview: NOT_ALLOWED');

    rpc.mockResolvedValueOnce({ data: { ...facts, unpaid: { total_pence: 1.5, count: 1 } }, error: null });
    await expect(schoolOverview('school-1', now)).rejects.toThrow();
  });
});
