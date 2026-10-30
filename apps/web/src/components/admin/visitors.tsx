import { countOf, formatCount } from '@repo/core/counts';
import type { StatsRange } from '@repo/core/stats-range';
import { BarChart } from '@repo/ui/bar-chart';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Skeleton } from '@repo/ui/skeleton';
import { X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { Figure } from '@/components/figure';
import {
  accountFilterKeys,
  answerLabel,
  barLegend,
  changeWords,
  filterNames,
  filterValueLabel,
  pagesPerVisit,
  screenHref,
  signupRate,
  visitBars,
  visitorFilterKeys,
  type VisitorFilterKey,
  type VisitorFilters,
} from '@/lib/admin/visitor-report';
import type { BreakdownRow, SignupCounts, VisitorsReport } from '@/lib/admin/visitors';

/**
 * The Visitors screen's parts (D-413): the figures, the chart, the filters chosen, a list for each
 * thing a visit can be told apart by, and the sign-ups beside them. Every row of every list is a
 * link that narrows the screen to it, so the screen works before it comes alive and each view has
 * an address staff can keep.
 */

export interface ScreenPlace {
  base: string;
  range: StatsRange;
  filters: VisitorFilters;
}

/** The figures at the top, each against the same days just before. */
export function VisitorFigures({ report }: { report: VisitorsReport }) {
  const signups = report.signups.totals;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="visitor-figures-title">
      <h2 id="visitor-figures-title" className="text-h3 text-black">
        {report.label}
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Visitors at a glance">
        <Figure label="Visits" value={formatCount(report.visits)} detail={changeWords(report.visits, report.before.visits)} />
        <Figure label="Page views" value={formatCount(report.pageViews)} detail={changeWords(report.pageViews, report.before.pageViews)} />
        <Figure label="Pages a visit" value={pagesPerVisit(report.visits, report.pageViews)} detail="Pages opened for each visit" />
        <Figure label="Sign-ups" value={formatCount(signups.total)} detail={changeWords(signups.total, report.signups.before)} />
        <Figure label="Sign-up rate" value={signupRate(report.visits, signups.total)} detail="Sign-ups for each hundred visits" />
      </dl>
    </section>
  );
}

/** Visits over the days, coloured by where they came from. */
export function VisitsChart({ report }: { report: VisitorsReport }) {
  const bars = visitBars(report.series, report.hourly);
  const each = report.hourly ? 'hour' : report.series.length > 92 ? 'week' : 'day';
  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="visits-chart-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="visits-chart-title">Visits each {each}</CardTitle>
        <CardDescription>{report.range}</CardDescription>
      </div>
      <BarChart bars={bars} legend={barLegend} label={`Visits each ${each}, ${report.label.toLowerCase()}`} />
    </Card>
  );
}

/** The filters chosen, each a link that takes it away. */
export function ActiveFilters({ place }: { place: ScreenPlace }) {
  const chosen = visitorFilterKeys.filter((key) => place.filters[key] !== undefined);
  if (chosen.length === 0) {
    return <p className="text-small text-grey-700">Showing every visit. Choose anything in a list below to see only those visits.</p>;
  }
  return (
    <nav aria-label="Filters chosen" className="flex flex-wrap items-center gap-2">
      {chosen.map((key) => (
        <Link
          key={key}
          href={screenHref(place.base, place.range, place.filters, { key, value: null }) as Route}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black px-4 py-1.5 text-small font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          {filterNames[key]}: {filterValueLabel(key, place.filters[key] ?? null)}
          <X size={16} strokeWidth={2} aria-hidden />
          <span className="sr-only">, take away</span>
        </Link>
      ))}
      <Link
        href={screenHref(place.base, place.range, {}) as Route}
        className="inline-flex min-h-10 items-center rounded-full px-3 text-small font-semibold text-blue underline underline-offset-4 hover:text-black"
      >
        Clear filters
      </Link>
    </nav>
  );
}

/** How many of each list are shown before "Show more". */
const shownFirst = 8;

function BreakdownRows({ filterKey, rows, place, byPages, largest }: { filterKey: VisitorFilterKey; rows: BreakdownRow[]; place: ScreenPlace; byPages: boolean; largest: number }) {
  const chosen = place.filters[filterKey];
  return (
    <ul className="flex flex-col">
      {rows.map((row) => {
        const value = row.key ?? '';
        const current = chosen === value;
        const counted = byPages ? row.pageViews : row.visits;
        const words = byPages ? countOf(counted, 'page view', 'page views') : countOf(counted, 'visit', 'visits');
        return (
          <li key={value}>
            <Link
              href={screenHref(place.base, place.range, place.filters, { key: filterKey, value: current ? null : value }) as Route}
              aria-current={current ? 'true' : undefined}
              className={`flex min-h-12 flex-col justify-center gap-1 rounded-input px-3 py-2 hover:bg-quiet focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black ${current ? 'bg-quiet' : ''}`}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className={`min-w-0 truncate text-body text-black ${current ? 'font-semibold' : ''}`}>{filterValueLabel(filterKey, row.key)}</span>
                <span className="shrink-0 text-small text-grey-700 tabular-nums">{words}</span>
              </span>
              <span className="h-1 w-full rounded-full bg-grey-100" aria-hidden>
                <span className="block h-1 rounded-full bg-black" style={{ width: `${String(largest === 0 ? 0 : Math.max((counted / largest) * 100, 1))}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One list: each value of one thing a visit can be told apart by, most first. Choosing a row shows
 * only those visits everywhere on the screen; choosing it again takes the filter away.
 */
export function Breakdown({
  title,
  description,
  filterKey,
  rows,
  place,
  byPages = false,
}: {
  title: string;
  description: string;
  filterKey: VisitorFilterKey;
  rows: BreakdownRow[];
  place: ScreenPlace;
  /** Counted by pages opened rather than visits begun: the pages read. */
  byPages?: boolean;
}) {
  const id = `breakdown-${filterKey}`;
  const largest = Math.max(0, ...rows.map((row) => (byPages ? row.pageViews : row.visits)));
  const first = rows.slice(0, shownFirst);
  const rest = rows.slice(shownFirst);
  return (
    <Card className="flex flex-col gap-3" role="region" aria-labelledby={id}>
      <div className="flex flex-col gap-1">
        <CardTitle id={id}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
      {rows.length === 0 ? (
        <p className="text-small text-grey-700">Nothing in these days.</p>
      ) : (
        <div className="-mx-3 flex flex-col">
          <BreakdownRows filterKey={filterKey} rows={first} place={place} byPages={byPages} largest={largest} />
          {rest.length === 0 ? null : (
            <details className="group">
              <summary className="mx-3 flex min-h-12 cursor-pointer list-none items-center text-small font-semibold text-blue underline underline-offset-4 hover:text-black [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {formatCount(rest.length)} more</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <BreakdownRows filterKey={filterKey} rows={rest} place={place} byPages={byPages} largest={largest} />
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

function SignupCells({ counts }: { counts: SignupCounts }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{formatCount(counts.instructors)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCount(counts.schools)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCount(counts.learners)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatCount(counts.undecided)}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCount(counts.total)}</td>
    </>
  );
}

function SignupTable({ caption, first, rows }: { caption: string; first: string; rows: { label: string; counts: SignupCounts }[] }) {
  return (
    // Wider than a narrow window, it scrolls, and a scrollable thing has to be reachable by keyboard
    // as well (axe: scrollable-region-focusable).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- that is the fix axe asks for
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[36rem] text-small text-ink">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-grey-200 text-left text-grey-700">
            <th scope="col" className="px-3 py-2 font-semibold">
              {first}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Instructors
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Schools
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Learners
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Not chosen yet
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              All
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-grey-200 last:border-b-0">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                {row.label}
              </th>
              <SignupCells counts={row.counts} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const roleWords: Record<string, string> = { learner: 'Learner', instructor: 'Instructor', school: 'School' };

/**
 * The accounts made in these days (D-413): where each came from by the link it arrived on, what
 * each said when asked how they heard about us, and what people wrote in their own words.
 */
export function SignupsBySource({ report, place }: { report: VisitorsReport; place: ScreenPlace }) {
  const { signups } = report;
  const narrowedElsewhere = visitorFilterKeys.some((key) => place.filters[key] !== undefined && !accountFilterKeys.includes(key));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="signups-title">
      <div className="flex flex-col gap-1">
        <h2 id="signups-title" className="text-h3 text-black">
          Sign-ups
        </h2>
        <p className="text-small text-grey-700">
          {countOf(signups.totals.total, 'account', 'accounts')} confirmed in these days.
          {narrowedElsewhere ? ' Only the group, source, medium and campaign filters apply here: an account has no page or device.' : ''}
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="signups-link-title">
          <div className="flex flex-col gap-1">
            <CardTitle id="signups-link-title">By the link they came on</CardTitle>
            <CardDescription>The tags of the link, carried from the site to sign-up.</CardDescription>
          </div>
          {signups.bySource.length === 0 ? (
            <p className="text-small text-grey-700">No sign-ups in these days.</p>
          ) : (
            <SignupTable
              caption="Sign-ups by the link they came on"
              first="Source"
              rows={signups.bySource.map((row) => ({ label: row.key === null ? 'No link tags' : filterValueLabel('source', row.key), counts: row }))}
            />
          )}
        </Card>
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="signups-answer-title">
          <div className="flex flex-col gap-1">
            <CardTitle id="signups-answer-title">How they said they heard about us</CardTitle>
            <CardDescription>Their answer as they made the account. It was optional.</CardDescription>
          </div>
          {signups.byAnswer.length === 0 ? (
            <p className="text-small text-grey-700">No sign-ups in these days.</p>
          ) : (
            <SignupTable
              caption="Sign-ups by how they said they heard about us"
              first="Answer"
              rows={signups.byAnswer.map((row) => ({ label: answerLabel(row.key), counts: row }))}
            />
          )}
        </Card>
      </div>
      {signups.inTheirWords.length === 0 ? null : (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="signups-words-title">
          <CardTitle id="signups-words-title">Somewhere else, in their own words</CardTitle>
          <ul className="flex flex-col gap-2">
            {signups.inTheirWords.map((answer) => (
              <li key={`${answer.when}-${answer.text}`} className="flex flex-col gap-0.5 rounded-input bg-quiet px-3 py-2">
                <span className="text-body text-black">{answer.text}</span>
                <span className="text-small text-grey-700">
                  {answer.role === null ? 'Not chosen yet' : (roleWords[answer.role] ?? answer.role)}, {answer.when}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

/** While the figures load: the same shapes, so nothing jumps when they arrive. */
export function VisitorsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-card" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-72 rounded-card" />
        ))}
      </div>
    </div>
  );
}
