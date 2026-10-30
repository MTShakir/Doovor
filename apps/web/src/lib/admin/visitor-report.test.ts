import { csvByteOrderMark } from '@repo/core/csv-write';
import { customRange, statsRange } from '@repo/core/stats-range';
import { describe, expect, it } from 'vitest';
import {
  answerLabel,
  changeWords,
  filterValueLabel,
  filtersFromParams,
  pagesPerVisit,
  screenHref,
  screenParams,
  signupRate,
  visitBars,
  visitsCsv,
  visitsFileName,
  type SeriesPoint,
} from './visitor-report';

const month = statsRange('last_30_days', '2026-10-30');
const week = statsRange('week', '2026-10-30');

describe('the Visitors screen’s address (D-413)', () => {
  it('reads the filters it knows, an empty one as unknown, and nothing else', () => {
    expect(filtersFromParams({ source: 'instagram', country: '', range: 'week', utm_source: 'x', page: ['/a', '/b'], city: 'x'.repeat(201) })).toEqual({
      source: 'instagram',
      country: '',
    });
  });

  it('keeps the days and the filters together, changing one filter at a time', () => {
    expect(screenParams(month, { source: 'card' })).toEqual({ source: 'card' });
    expect(screenParams(week, {})).toEqual({ range: 'week' });
    const typed = customRange('2026-10-01', '2026-10-15');
    if (typed === null) throw new Error('a range of two dates');
    expect(screenParams(typed, { device: 'phone' })).toEqual({ from: '2026-10-01', to: '2026-10-15', device: 'phone' });

    expect(screenHref('/admin/visitors', week, { source: 'card' }, { key: 'device', value: 'phone' })).toBe('/admin/visitors?range=week&source=card&device=phone');
    expect(screenHref('/admin/visitors', week, { source: 'card' }, { key: 'source', value: null })).toBe('/admin/visitors?range=week');
    expect(screenHref('/admin/visitors', month, {})).toBe('/admin/visitors');
    expect(screenHref('/admin/visitors', month, {}, { key: 'country', value: '' })).toBe('/admin/visitors?country=');
  });
});

describe('the Visitors screen’s words (D-413)', () => {
  it('names each value as people say it, and what is not known as such', () => {
    expect(filterValueLabel('channel', 'print')).toBe('Printed QR codes');
    expect(filterValueLabel('channel', 'carrier-pigeon')).toBe('carrier-pigeon');
    expect(filterValueLabel('source', 'card')).toBe('Business card');
    expect(filterValueLabel('device', 'phone')).toBe('Phone');
    expect(filterValueLabel('device', 'watch')).toBe('watch');
    expect(filterValueLabel('app', 'instagram')).toBe('Instagram app');
    expect(filterValueLabel('app', 'myspace')).toBe('myspace');
    expect(filterValueLabel('country', 'GB')).toBe('United Kingdom');
    expect(filterValueLabel('city', 'Belvedere')).toBe('Belvedere');
    expect(filterValueLabel('campaign', null)).toBe('No campaign');
    expect(filterValueLabel('app', '')).toBe('Not in an app');
    expect(filterValueLabel('country', null)).toBe('Not known');
    expect(answerLabel('word_of_mouth')).toBe('A friend or another instructor');
    expect(answerLabel(null)).toBe('No answer');
    expect(answerLabel('carrier-pigeon')).toBe('carrier-pigeon');
  });

  it('compares with the days before, in words', () => {
    expect(changeWords(12, 10)).toBe('Up 20% on the days before');
    expect(changeWords(5, 10)).toBe('Down 50% on the days before');
    expect(changeWords(10, 10)).toBe('The same as the days before');
    expect(changeWords(3, 0)).toBe('None in the days before');
    expect(changeWords(0, 0)).toBe('None in the days before either');
  });

  it('says pages a visit and the sign-up rate plainly', () => {
    expect(pagesPerVisit(40, 96)).toBe('2.4');
    expect(pagesPerVisit(10, 20)).toBe('2');
    expect(pagesPerVisit(0, 5)).toBe('0');
    expect(signupRate(40, 6)).toBe('15%');
    expect(signupRate(400, 6)).toBe('1.5%');
    expect(signupRate(100, 1)).toBe('1%');
    expect(signupRate(0, 2)).toBe('0%');
  });
});

describe('the chart of visits (D-413)', () => {
  const day = (at: string, social: number, direct = 0): SeriesPoint => ({ at, visits: social + direct, pageViews: (social + direct) * 2, channels: { social, direct } });

  it('draws an hour a bar for a day, naming every third', () => {
    const hours: SeriesPoint[] = Array.from({ length: 24 }, (_, hour): SeriesPoint => ({
      at: `2026-10-30T${String(hour).padStart(2, '0')}:00:00Z`,
      visits: hour === 9 ? 3 : 0,
      pageViews: hour === 9 ? 5 : 0,
      channels: hour === 9 ? { social: 2, ai: 1 } : {},
    }));
    const bars = visitBars(hours, true);
    expect(bars).toHaveLength(24);
    expect(bars.map((bar) => bar.label).slice(0, 4)).toEqual(['00:00', '', '', '03:00']);
    expect(bars[9]?.description).toBe('09:00: 3 visits, 5 page views');
    expect(bars[9]?.slices).toEqual([
      { key: 'social', value: 2 },
      { key: 'search', value: 0 },
      { key: 'print', value: 0 },
      { key: 'direct', value: 0 },
      { key: 'other', value: 1 },
    ]);
  });

  it('draws a day a bar for a week or a month, and names the days that fit', () => {
    const days = ['2026-10-26', '2026-10-27', '2026-10-28'].map((at) => day(at, 1));
    expect(visitBars(days, false).map((bar) => bar.label)).toEqual(['Mon', 'Tue', 'Wed']);
    expect(visitBars(days, false)[0]?.description).toBe('Mon 26 Oct: 1 visit, 2 page views');

    const thirty = Array.from({ length: 30 }, (_, index) => day(`2026-10-${String(index + 1).padStart(2, '0')}`, index));
    const labels = visitBars(thirty, false).map((bar) => bar.label);
    expect(labels[0]).toBe('1 Oct');
    expect(labels[7]).toBe('8 Oct');
    expect(labels[1]).toBe('');
  });

  it('draws a week a bar for anything longer than three months', () => {
    const year = Array.from({ length: 100 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
      return day(date, 1, 1);
    });
    const bars = visitBars(year, false);
    expect(bars).toHaveLength(15);
    expect(bars[0]).toMatchObject({ id: '2026-01-01', label: '1 Jan', description: 'The week from Thu 1 Jan: 14 visits, 28 page views' });
    expect(bars[0]?.slices.find((slice) => slice.key === 'direct')?.value).toBe(7);
    expect(bars.at(-1)?.description).toBe('The week from Thu 9 Apr: 4 visits, 8 page views');
  });
});

describe('the spreadsheet of visits (D-413)', () => {
  it('writes a row a page opened, the hour in London, in the screen’s own words', () => {
    const csv = visitsCsv([
      {
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
      },
    ]);
    expect(csv.startsWith(csvByteOrderMark)).toBe(true);
    const [header, first] = csv.slice(csvByteOrderMark.length).split('\r\n');
    expect(header).toBe('Hour,Page,First page of the visit,Landing page,Group,Source,Medium,Campaign,Came from,Country,Region,Town,Device,Browser,System,App');
    expect(first).toBe('Tue 27 Oct 2026 09:00,/join,Yes,/join,Printed QR codes,Business card,,week1,,GB,ENG,Belvedere,Phone,Safari,iOS,');
    expect(visitsFileName(week)).toBe('visits-2026-10-26-to-2026-11-01.csv');
    expect(visitsFileName(statsRange('today', '2026-10-30'))).toBe('visits-2026-10-30.csv');
  });
});
