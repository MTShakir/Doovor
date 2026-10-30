import { rangeFromParams } from '@repo/core/stats-range';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DateRangePicker } from '@/components/admin/date-range';
import { ActiveFilters, Breakdown, SignupsBySource, VisitorFigures, VisitorsSkeleton, VisitsChart, type ScreenPlace } from '@/components/admin/visitors';
import { filtersFromParams, screenParams, visitorFilterKeys } from '@/lib/admin/visitor-report';
import { visitorsReport } from '@/lib/admin/visitors';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Visitors' };

type VisitorsParams = Promise<Record<string, string | string[] | undefined>>;

const base = '/admin/visitors';

/**
 * Visits to the public site, where they came from, what they opened, where from and on what, and
 * the sign-ups beside them, over the days chosen and narrowed by anything in the lists (D-413).
 * Counted without cookies, so everybody is counted, and nothing about anybody is kept.
 */
export default function VisitorsPage({ searchParams }: { searchParams: VisitorsParams }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Visitors"
        subtitle="Visits to the website, where they came from, and the sign-ups they led to. Counted without cookies."
      />
      <div className="flex flex-col gap-6 px-4 md:px-8 lg:max-w-6xl">
        <Suspense fallback={<VisitorsSkeleton />}>
          <Visitors searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Visitors({ searchParams }: { searchParams: VisitorsParams }) {
  await requirePortal('admin');
  const today = todayInZone();
  const params = await searchParams;
  const range = rangeFromParams(
    { range: typeof params.range === 'string' ? params.range : undefined, from: typeof params.from === 'string' ? params.from : undefined, to: typeof params.to === 'string' ? params.to : undefined },
    today,
  );
  const filters = filtersFromParams(params);
  const report = await visitorsReport(range, filters);
  const place: ScreenPlace = { base, range, filters };
  const keep = Object.fromEntries(visitorFilterKeys.flatMap((key) => (filters[key] === undefined ? [] : [[key, filters[key]]])));
  const download = `${base}/download?${new URLSearchParams(screenParams(range, filters)).toString()}`;

  return (
    <>
      <DateRangePicker today={today} chosen={range} base={base} keep={keep} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ActiveFilters place={place} />
        <Button asChild variant="secondary">
          <a href={download} download>
            Download as a spreadsheet
          </a>
        </Button>
      </div>
      <VisitorFigures report={report} />
      <VisitsChart report={report} />

      <section className="flex flex-col gap-3" aria-labelledby="came-from-title">
        <h2 id="came-from-title" className="text-h3 text-black">
          Where they came from
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Breakdown title="Groups" description="Social media, search, the printed codes and the rest." filterKey="channel" rows={report.breakdowns.channel} place={place} />
          <Breakdown title="Sources" description="The site, app or printed piece each visit came from." filterKey="source" rows={report.breakdowns.source} place={place} />
          <Breakdown title="Campaigns" description="The campaign tag on the link, such as week2." filterKey="campaign" rows={report.breakdowns.campaign} place={place} />
          <Breakdown title="Mediums" description="The medium tag on the link, such as social or qr." filterKey="medium" rows={report.breakdowns.medium} place={place} />
          <Breakdown title="Sites they came from" description="The site the browser said the visit came from." filterKey="referrer" rows={report.breakdowns.referrer} place={place} />
          <Breakdown title="Opened inside an app" description="Visits opened in an app's own browser, such as Instagram's." filterKey="app" rows={report.breakdowns.app} place={place} />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="opened-title">
        <h2 id="opened-title" className="text-h3 text-black">
          What they opened
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Breakdown title="Landing pages" description="The page each visit began on." filterKey="landing" rows={report.breakdowns.landing} place={place} />
          <Breakdown title="Pages read" description="Every page opened, in a visit or at its start." filterKey="page" rows={report.breakdowns.page} place={place} byPages />
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="where-title">
        <h2 id="where-title" className="text-h3 text-black">
          Where they are, and on what
        </h2>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Breakdown title="Countries" description="Where the visit's connection was." filterKey="country" rows={report.breakdowns.country} place={place} />
          <Breakdown title="Towns" description="The nearest town to the connection, roughly." filterKey="city" rows={report.breakdowns.city} place={place} />
          <Breakdown title="Devices" description="Phone, tablet or computer." filterKey="device" rows={report.breakdowns.device} place={place} />
          <Breakdown title="Browsers" description="The browser, or the app it opened in." filterKey="browser" rows={report.breakdowns.browser} place={place} />
          <Breakdown title="Systems" description="The phone's or computer's system." filterKey="system" rows={report.breakdowns.system} place={place} />
        </div>
      </section>

      <SignupsBySource report={report} place={place} />
    </>
  );
}
