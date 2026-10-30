import { statsRange } from '@repo/core/stats-range';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { visitRows, visitorsReport } = await import('./visitors');

// This week, Monday 26 October to Sunday 1 November 2026, after the clocks went back.
const range = statsRange('week', '2026-10-30');

const empty = { key: null, visits: 0, page_views: 0 };
const facts = {
  hourly: false,
  totals: { visits: 40, page_views: 96 },
  before: { visits: 32, page_views: 70 },
  series: [{ at: '2026-10-26', visits: 6, page_views: 14, channels: { social: 4, direct: 2 } }],
  breakdowns: {
    channel: [{ key: 'social', visits: 25, page_views: 60 }],
    source: [{ key: 'instagram', visits: 20, page_views: 50 }],
    medium: [empty],
    campaign: [{ key: 'week2', visits: 12, page_views: 30 }],
    landing: [{ key: '/join', visits: 9, page_views: 15 }],
    page: [{ key: '/pricing', visits: 4, page_views: 22 }],
    referrer: [],
    country: [{ key: 'GB', visits: 38, page_views: 90 }],
    city: [{ key: 'London', visits: 10, page_views: 24 }],
    device: [{ key: 'phone', visits: 30, page_views: 70 }],
    browser: [{ key: 'Instagram app', visits: 15, page_views: 33 }],
    system: [{ key: 'iOS', visits: 22, page_views: 51 }],
    app: [{ key: 'instagram', visits: 15, page_views: 33 }],
  },
  signups: {
    totals: { learners: 2, instructors: 3, schools: 1, undecided: 0 },
    before: 4,
    by_source: [{ key: 'card', channel: 'print', learners: 0, instructors: 2, schools: 0, undecided: 0 }],
    by_answer: [{ key: 'word_of_mouth', learners: 1, instructors: 1, schools: 0, undecided: 0 }],
    in_their_words: [{ text: 'A stand at a show', role: 'instructor', at: '2026-10-27T10:00:00+00:00' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the visitors report (D-413)', () => {
  it('asks for the days chosen, in London, with the filters, and reads what the database works out', async () => {
    rpc.mockResolvedValueOnce({ data: facts, error: null });
    const report = await visitorsReport(range, { source: 'instagram', country: '' });

    expect(rpc).toHaveBeenCalledWith('site_visits_report', {
      p_from: '2026-10-26T00:00:00.000Z',
      p_to: '2026-11-02T00:00:00.000Z',
      p_filters: { source: 'instagram', country: '' },
    });
    expect(report).toMatchObject({
      label: 'This week',
      hourly: false,
      visits: 40,
      pageViews: 96,
      before: { visits: 32, pageViews: 70 },
      series: [{ at: '2026-10-26', visits: 6, pageViews: 14, channels: { social: 4, direct: 2 } }],
    });
    expect(report.breakdowns.page).toEqual([{ key: '/pricing', visits: 4, pageViews: 22 }]);
    expect(report.breakdowns.medium).toEqual([{ key: null, visits: 0, pageViews: 0 }]);
    expect(report.signups.totals).toEqual({ learners: 2, instructors: 3, schools: 1, undecided: 0, total: 6 });
    expect(report.signups.bySource).toEqual([{ key: 'card', channel: 'print', learners: 0, instructors: 2, schools: 0, undecided: 0, total: 2 }]);
    expect(report.signups.byAnswer[0]?.total).toBe(2);
    expect(report.signups.inTheirWords).toEqual([{ text: 'A stand at a show', role: 'instructor', when: 'Tue 27 Oct' }]);
  });

  it('fails rather than passing for a quiet week when it cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ALLOWED' } });
    await expect(visitorsReport(range, {})).rejects.toThrow('Could not read the visitors report: NOT_ALLOWED');
    rpc.mockResolvedValueOnce({ data: { totals: 'lots' }, error: null });
    await expect(visitorsReport(range, {})).rejects.toThrow();
  });

  it('reads the rows for the spreadsheet', async () => {
    const line = {
      occurred_at: '2026-10-27T09:00:00+00:00',
      path: '/join',
      entry: true,
      landing: '/join',
      channel: 'print',
      source: 'card',
      medium: null,
      campaign: 'week1',
      referrer: null,
      country: 'GB',
      region: 'ENG',
      city: 'Belvedere',
      device: 'phone',
      browser: 'Safari',
      system: 'iOS',
      app: null,
    };
    rpc.mockResolvedValueOnce({ data: [line], error: null });
    expect(await visitRows(range, { source: 'card' })).toEqual([line]);
    expect(rpc).toHaveBeenCalledWith('site_visits_rows', expect.objectContaining({ p_filters: { source: 'card' } }));
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ALLOWED' } });
    await expect(visitRows(range, {})).rejects.toThrow('Could not read the visits: NOT_ALLOWED');
  });
});
