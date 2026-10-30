import 'server-only';
import { periodInstants } from '@repo/core/money-periods';
import type { StatsRange } from '@repo/core/stats-range';
import { formatDate } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SeriesPoint, VisitorFilterKey, VisitorFilters } from './visitor-report';

const count = z.number().int();
const row = z.object({ key: z.string().nullable(), visits: count, page_views: count });
const byRole = { learners: count, instructors: count, schools: count, undecided: count };

// The function answers JSON, so it is read the way any input is.
const reportSchema = z.object({
  hourly: z.boolean(),
  totals: z.object({ visits: count, page_views: count }),
  before: z.object({ visits: count, page_views: count }),
  series: z.array(z.object({ at: z.string(), visits: count, page_views: count, channels: z.record(z.string(), count) })),
  breakdowns: z.object({
    channel: z.array(row),
    source: z.array(row),
    medium: z.array(row),
    campaign: z.array(row),
    landing: z.array(row),
    page: z.array(row),
    referrer: z.array(row),
    country: z.array(row),
    city: z.array(row),
    device: z.array(row),
    browser: z.array(row),
    system: z.array(row),
    app: z.array(row),
  }),
  signups: z.object({
    totals: z.object(byRole),
    before: count,
    by_source: z.array(z.object({ key: z.string().nullable(), channel: z.string().nullable(), ...byRole })),
    by_answer: z.array(z.object({ key: z.string().nullable(), ...byRole })),
    in_their_words: z.array(z.object({ text: z.string(), role: z.string().nullable(), at: z.string() })),
  }),
});

export interface BreakdownRow {
  key: string | null;
  visits: number;
  pageViews: number;
}

export interface SignupCounts {
  learners: number;
  instructors: number;
  schools: number;
  undecided: number;
  total: number;
}

export interface VisitorsReport {
  /** "Last 30 days", "Today", or the days themselves. */
  label: string;
  /** The days in words. */
  range: string;
  hourly: boolean;
  visits: number;
  pageViews: number;
  before: { visits: number; pageViews: number };
  series: SeriesPoint[];
  breakdowns: Record<VisitorFilterKey, BreakdownRow[]>;
  signups: {
    totals: SignupCounts;
    before: number;
    bySource: (SignupCounts & { key: string | null; channel: string | null })[];
    byAnswer: (SignupCounts & { key: string | null })[];
    /** "Wed 21 Oct": the day each was written, in London. */
    inTheirWords: { text: string; role: string | null; when: string }[];
  };
}

function withTotal<T extends { learners: number; instructors: number; schools: number; undecided: number }>(counts: T): T & { total: number } {
  return { ...counts, total: counts.learners + counts.instructors + counts.schools + counts.undecided };
}

function rows(list: z.infer<typeof row>[]): BreakdownRow[] {
  return list.map((one) => ({ key: one.key, visits: one.visits, pageViews: one.page_views }));
}

/**
 * Visits to the public site, and the sign-ups beside them, over a range of days and the filters
 * chosen (D-413). The database works the figures out, and refuses anybody who is not platform staff
 * past their second step. Throws when the figures cannot be read, rather than passing for a quiet
 * month.
 */
export async function visitorsReport(range: StatsRange, filters: VisitorFilters): Promise<VisitorsReport> {
  const { from, to } = periodInstants(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('site_visits_report', { p_from: from.toISOString(), p_to: to.toISOString(), p_filters: filters });
  if (error) throw new Error(`Could not read the visitors report: ${error.message}`);
  const facts = reportSchema.parse(data);
  const { breakdowns, signups } = facts;

  return {
    label: range.label,
    range: range.range,
    hourly: facts.hourly,
    visits: facts.totals.visits,
    pageViews: facts.totals.page_views,
    before: { visits: facts.before.visits, pageViews: facts.before.page_views },
    series: facts.series.map((point) => ({ at: point.at, visits: point.visits, pageViews: point.page_views, channels: point.channels })),
    breakdowns: {
      channel: rows(breakdowns.channel),
      source: rows(breakdowns.source),
      medium: rows(breakdowns.medium),
      campaign: rows(breakdowns.campaign),
      landing: rows(breakdowns.landing),
      page: rows(breakdowns.page),
      referrer: rows(breakdowns.referrer),
      country: rows(breakdowns.country),
      city: rows(breakdowns.city),
      device: rows(breakdowns.device),
      browser: rows(breakdowns.browser),
      system: rows(breakdowns.system),
      app: rows(breakdowns.app),
    },
    signups: {
      totals: withTotal(signups.totals),
      before: signups.before,
      bySource: signups.by_source.map(withTotal),
      byAnswer: signups.by_answer.map(withTotal),
      inTheirWords: signups.in_their_words.map((answer) => ({ text: answer.text, role: answer.role, when: formatDate(new Date(answer.at)) })),
    },
  };
}

const visitRowSchema = z.object({
  occurred_at: z.string(),
  path: z.string(),
  entry: z.boolean(),
  landing: z.string().nullable(),
  channel: z.string(),
  source: z.string(),
  medium: z.string().nullable(),
  campaign: z.string().nullable(),
  referrer: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  device: z.string(),
  browser: z.string(),
  system: z.string(),
  app: z.string().nullable(),
});

export type VisitRow = z.infer<typeof visitRowSchema>;

/** The visits themselves, newest first, for the spreadsheet staff download. */
export async function visitRows(range: StatsRange, filters: VisitorFilters): Promise<VisitRow[]> {
  const { from, to } = periodInstants(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('site_visits_rows', { p_from: from.toISOString(), p_to: to.toISOString(), p_filters: filters });
  if (error) throw new Error(`Could not read the visits: ${error.message}`);
  return z.array(visitRowSchema).parse(data);
}
