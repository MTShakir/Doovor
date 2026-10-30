import { formatCount } from '@repo/core/counts';
import { toCsv } from '@repo/core/csv-write';
import type { StatsRange } from '@repo/core/stats-range';
import { addDaysToLocalDate, formatCalendarDate, formatTime, todayInZone, type LocalDate } from '@repo/core/time';
import { channelLabels, deviceLabels, heardAboutLabels, inAppLabel, isChannel, isDevice, isHeardAbout, isInAppBrowser, sourceLabel } from '@repo/core/visits';
import type { Bar, BarChartLegend } from '@repo/ui/bar-chart';

/**
 * How the Visitors screen reads its address and words its figures (D-413). Every list on the screen
 * is also a filter: a value chosen narrows everything else, and filters add up. An empty value is
 * the visits where that thing is not known.
 */

export const visitorFilterKeys = [
  'channel',
  'source',
  'medium',
  'campaign',
  'landing',
  'page',
  'referrer',
  'country',
  'city',
  'device',
  'browser',
  'system',
  'app',
] as const;
export type VisitorFilterKey = (typeof visitorFilterKeys)[number];
export type VisitorFilters = Partial<Record<VisitorFilterKey, string>>;

/** The filters an account has an answer for; the rest are about pages, not people. */
export const accountFilterKeys: readonly VisitorFilterKey[] = ['channel', 'source', 'medium', 'campaign'];

/** What each filter is called on the screen. */
export const filterNames: Record<VisitorFilterKey, string> = {
  channel: 'Group',
  source: 'Source',
  medium: 'Medium',
  campaign: 'Campaign',
  landing: 'Landing page',
  page: 'Page',
  referrer: 'Came from',
  country: 'Country',
  city: 'Town',
  device: 'Device',
  browser: 'Browser',
  system: 'System',
  app: 'App',
};

/** What a value that is not known is called, list by list. */
const unknownNames: Record<VisitorFilterKey, string> = {
  channel: 'Not known',
  source: 'Not known',
  medium: 'No medium',
  campaign: 'No campaign',
  landing: 'Not known',
  page: 'Not known',
  referrer: 'No site',
  country: 'Not known',
  city: 'Not known',
  device: 'Not known',
  browser: 'Not known',
  system: 'Not known',
  app: 'Not in an app',
};

/** The filters an address asks for. Anything else in it is not a filter. */
export function filtersFromParams(params: Record<string, string | string[] | undefined>): VisitorFilters {
  const filters: VisitorFilters = {};
  for (const key of visitorFilterKeys) {
    const value = params[key];
    if (typeof value === 'string' && value.length <= 200) filters[key] = value;
  }
  return filters;
}

/** The dates and filters as an address's query, so every link and form keeps both. */
export function screenParams(range: StatsRange, filters: VisitorFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (range.key === 'custom') {
    params.from = range.from;
    params.to = range.to;
  } else if (range.key !== 'last_30_days') {
    params.range = range.key;
  }
  for (const key of visitorFilterKeys) {
    const value = filters[key];
    if (value !== undefined) params[key] = value;
  }
  return params;
}

/** An address of the screen, with one filter changed: set to a value, or taken away with null. */
export function screenHref(base: string, range: StatsRange, filters: VisitorFilters, change?: { key: VisitorFilterKey; value: string | null }): string {
  const next: VisitorFilters = {};
  for (const key of visitorFilterKeys) {
    const value = change?.key === key ? change.value : filters[key];
    if (value !== null && value !== undefined) next[key] = value;
  }
  const query = new URLSearchParams(screenParams(range, next)).toString();
  return query === '' ? base : `${base}?${query}`;
}

const regions = new Intl.DisplayNames(['en-GB'], { type: 'region' });

/** A value as the screen says it: "Instagram", "Phone", "United Kingdom", or what it is unknown as. */
export function filterValueLabel(key: VisitorFilterKey, value: string | null): string {
  if (value === null || value === '') return unknownNames[key];
  if (key === 'channel') return isChannel(value) ? channelLabels[value] : value;
  if (key === 'source') return sourceLabel(value);
  if (key === 'device') return isDevice(value) ? deviceLabels[value] : value;
  if (key === 'app') return isInAppBrowser(value) ? inAppLabel(value) : value;
  if (key === 'country') {
    try {
      return regions.of(value) ?? value;
    } catch {
      return value;
    }
  }
  return value;
}

/** An answer to "How did you hear about us?" as the screen says it. */
export function answerLabel(value: string | null): string {
  if (value === null) return 'No answer';
  return isHeardAbout(value) ? heardAboutLabels[value] : value;
}

/** "Up 12% on the days before", "Down 5% on the days before", or the same. */
export function changeWords(now: number, before: number): string {
  if (before === 0) return now === 0 ? 'None in the days before either' : 'None in the days before';
  const percent = Math.round(((now - before) / before) * 100);
  if (percent === 0) return 'The same as the days before';
  return percent > 0 ? `Up ${String(percent)}% on the days before` : `Down ${String(-percent)}% on the days before`;
}

/** Pages opened for each visit, to one place: "2.4". */
export function pagesPerVisit(visits: number, pageViews: number): string {
  return visits === 0 ? '0' : (pageViews / visits).toFixed(1).replace(/\.0$/, '');
}

/** The share of visits that made an account: "3.2%". */
export function signupRate(visits: number, signups: number): string {
  if (visits === 0) return '0%';
  const rate = (signups / visits) * 100;
  return `${rate >= 10 ? Math.round(rate).toString() : rate.toFixed(1).replace(/\.0$/, '')}%`;
}

export interface SeriesPoint {
  /** An hour as an instant ("2026-10-30T09:00:00Z"), or a day in London ("2026-10-30"). */
  at: string;
  visits: number;
  pageViews: number;
  channels: Record<string, number>;
}

/** The groups a bar is coloured by: the four people ask about, and everything else together. */
export const barLegend: BarChartLegend[] = [
  { key: 'social', label: channelLabels.social, fill: 'bg-blue' },
  { key: 'search', label: channelLabels.search, fill: 'bg-green' },
  { key: 'print', label: channelLabels.print, fill: 'bg-yellow' },
  { key: 'direct', label: channelLabels.direct, fill: 'bg-black' },
  { key: 'other', label: 'Everything else', fill: 'bg-grey-400' },
];

function slicesOf(channels: Record<string, number>): Bar['slices'] {
  const known = ['social', 'search', 'print', 'direct'];
  const rest = Object.entries(channels)
    .filter(([channel]) => !known.includes(channel))
    .reduce((sum, [, value]) => sum + value, 0);
  return [...known.map((key) => ({ key, value: channels[key] ?? 0 })), { key: 'other', value: rest }];
}

function addChannels(into: Record<string, number>, from: Record<string, number>): Record<string, number> {
  const sum = { ...into };
  for (const [channel, value] of Object.entries(from)) sum[channel] = (sum[channel] ?? 0) + value;
  return sum;
}

function inWords(when: string, point: { visits: number; pageViews: number }): string {
  const visits = point.visits === 1 ? '1 visit' : `${formatCount(point.visits)} visits`;
  const views = point.pageViews === 1 ? '1 page view' : `${formatCount(point.pageViews)} page views`;
  return `${when}: ${visits}, ${views}`;
}

/** "1 Oct": a day short enough to sit under a bar. */
function dayAndMonth(date: LocalDate): string {
  return formatCalendarDate(date, { year: false }).split(' ').slice(1, 3).join(' ');
}

/**
 * The bars of the chart: an hour each for a day, a day each for up to three months, and a week each
 * for anything longer, so a tax year is fifty two bars rather than three hundred and sixty five.
 * Each bar is visits, coloured by where they came from, and says in words what it holds.
 */
export function visitBars(series: readonly SeriesPoint[], hourly: boolean): Bar[] {
  if (hourly) {
    return series.map((point, index) => {
      const time = formatTime(new Date(point.at));
      return { id: point.at, label: index % 3 === 0 ? time : '', description: inWords(time, point), slices: slicesOf(point.channels) };
    });
  }
  if (series.length <= 92) {
    return series.map((point, index) => ({
      id: point.at,
      label: series.length <= 7 ? formatCalendarDate(point.at).slice(0, 3) : index % 7 === 0 ? dayAndMonth(point.at) : '',
      description: inWords(formatCalendarDate(point.at, { year: false }), point),
      slices: slicesOf(point.channels),
    }));
  }
  const weeks: { start: LocalDate; visits: number; pageViews: number; channels: Record<string, number> }[] = [];
  for (const point of series) {
    const last = weeks.at(-1);
    if (last !== undefined && point.at < addDaysToLocalDate(last.start, 7)) {
      last.visits += point.visits;
      last.pageViews += point.pageViews;
      last.channels = addChannels(last.channels, point.channels);
    } else {
      weeks.push({ start: point.at, visits: point.visits, pageViews: point.pageViews, channels: { ...point.channels } });
    }
  }
  return weeks.map((week, index) => ({
    id: week.start,
    label: index % 4 === 0 ? dayAndMonth(week.start) : '',
    description: inWords(`The week from ${formatCalendarDate(week.start, { year: false })}`, week),
    slices: slicesOf(week.channels),
  }));
}

/** A visit as the spreadsheet has it: one row a page opened. */
export interface VisitLine {
  occurred_at: string;
  path: string;
  entry: boolean;
  landing: string | null;
  channel: string;
  source: string;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device: string;
  browser: string;
  system: string;
  app: string | null;
}

/** The visits as a spreadsheet: the hour in London, then everything the screen can filter by. */
export function visitsCsv(lines: readonly VisitLine[]): string {
  const header = [
    'Hour',
    'Page',
    'First page of the visit',
    'Landing page',
    'Group',
    'Source',
    'Medium',
    'Campaign',
    'Came from',
    'Country',
    'Region',
    'Town',
    'Device',
    'Browser',
    'System',
    'App',
  ];
  const rows = lines.map((line) => {
    const at = new Date(line.occurred_at);
    return [
      `${formatCalendarDate(todayInZone(at), { year: true })} ${formatTime(at)}`,
      line.path,
      line.entry ? 'Yes' : 'No',
      line.landing,
      filterValueLabel('channel', line.channel),
      filterValueLabel('source', line.source),
      line.medium,
      line.campaign,
      line.referrer,
      line.country,
      line.region,
      line.city,
      filterValueLabel('device', line.device),
      line.browser,
      line.system,
      line.app === null ? null : filterValueLabel('app', line.app),
    ];
  });
  return toCsv([header, ...rows]);
}

/** "visits-2026-10-01-to-2026-10-30.csv". */
export function visitsFileName(range: StatsRange): string {
  return range.from === range.to ? `visits-${range.from}.csv` : `visits-${range.from}-to-${range.to}.csv`;
}
