import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.fn<() => Record<string, unknown>[]>();
const instructorFilter = vi.fn();

/** The query the diary builds: a chain that ends in something to await, with or without `.in`. */
function bookingsQuery() {
  const answer = () => Promise.resolve({ data: rows(), error: null });
  const chain = {
    select: () => chain,
    gte: () => chain,
    lt: () => chain,
    order: () =>
      Object.assign(answer(), {
        in: (column: string, values: string[]) => {
          instructorFilter(column, values);
          return answer();
        },
      }),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => ({ from: () => bookingsQuery() }) }));

const { lessonsBetween } = await import('./lessons');

/** One lesson as the database hands it back, with whatever row-level security let through. */
const lesson = (overrides: Record<string, unknown> = {}) => ({
  id: 'lesson-1',
  instructor_id: 'profile-emma',
  starts_at: '2027-09-12T09:00:00Z',
  ends_at: '2027-09-12T10:00:00Z',
  status: 'confirmed',
  payment_status: 'unpaid',
  source: 'instructor',
  price_pence: 4200,
  users: { full_name: 'Polly Payne' },
  lesson_types: { name: 'Standard lesson', kind: 'standard' },
  instructor_profiles: { display_name: 'Emma Clarke' },
  pickup_points: null,
  ...overrides,
});

const from = new Date('2027-09-12T00:00:00Z');
const to = new Date('2027-09-13T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lessonsBetween (DIA-03, D-097)', () => {
  it('says who each lesson is with', async () => {
    rows.mockReturnValue([lesson()]);

    const [entry] = await lessonsBetween(from, to, ['profile-emma']);

    expect(entry).toMatchObject({ learnerName: 'Polly Payne', lessonType: 'Standard lesson', instructorName: 'Emma Clarke' });
    expect(instructorFilter).toHaveBeenCalledWith('instructor_id', ['profile-emma']);
  });

  it('shows a lesson whose learner it may not read under a neutral label, instead of failing', async () => {
    rows.mockReturnValue([lesson({ users: null }), lesson({ id: 'lesson-2', starts_at: '2027-09-12T11:00:00Z' })]);

    const entries = await lessonsBetween(from, to);

    expect(entries.map((entry) => entry.learnerName)).toEqual(['Unnamed learner', 'Polly Payne']);
    expect(entries[0]).toMatchObject({ id: 'lesson-1', pricePence: 4200, facts: { status: 'confirmed', kind: 'standard' } });
    expect(instructorFilter).not.toHaveBeenCalled();
  });

  it('uses the same label for a learner nobody has named', async () => {
    rows.mockReturnValue([lesson({ users: { full_name: '' } })]);

    const [entry] = await lessonsBetween(from, to);

    expect(entry?.learnerName).toBe('Unnamed learner');
  });
});
