import { formatMiles } from '@repo/core/mileage';
import { formatPence } from '@repo/core/money';
import { formatDate, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, Car } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { booksAccess, booksFor, booksYearFrom, mileageFor, vehiclesFor } from '@/lib/books/books';
import { LogMileage } from './log-mileage';

export const metadata: Metadata = { title: 'Mileage' };

/** MNY-03: the miles an instructor drove for work, a tax year at a time. */
export default function MileagePage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-4 md:px-8">
        <Link
          href="/app/instructor/books"
          className="inline-flex min-h-12 items-center gap-1 text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden />
          Bookkeeping
        </Link>
      </div>
      <PageHeader title="Mileage" subtitle="The miles you drove for work, at the approved rates." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Mileage searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Mileage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  await connection();
  const access = await booksAccess();
  if (!access?.solo || !access.included) return null;

  const year = booksYearFrom((await searchParams).year);
  const [trips, vehicles, summary] = await Promise.all([
    mileageFor(access.businessId, year),
    vehiclesFor(access.businessId),
    booksFor(access.businessId, year),
  ]);
  const usable = vehicles.filter((one) => one.claimMethod !== 'actual_costs');

  if (vehicles.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Car}
          title="Add a car first"
          description="Mileage is kept against the car that drove it, so the books know which is claimed how."
          action={
            <Button width="full" asChild>
              <Link href="/app/instructor/books/setup">Go to setup</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      {usable.length > 0 ? <LogMileage today={todayInZone()} vehicles={usable.map((one) => ({ id: one.id, name: one.name }))} /> : null}

      {summary && summary.mileage.claimPence > 0 ? (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="mileage-claim-title">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle id="mileage-claim-title">{year.label}</CardTitle>
            <span className="text-body text-ink tabular-nums">{formatPence(summary.mileage.claimPence)}</span>
          </div>
          <CardDescription>{formatMiles(summary.mileage.tenths)} over the year.</CardDescription>
          <dl className="flex flex-col gap-1">
            {summary.mileage.bands.map((band) => (
              <div key={band.pencePerMile} className="flex items-baseline justify-between gap-3">
                <dt className="text-small text-grey-700">
                  {formatMiles(band.tenths)} at {String(band.pencePerMile)}p
                </dt>
                <dd className="text-small text-ink tabular-nums">{formatPence(band.totalPence)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {trips.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={Car} title="No trips yet" description="Log the miles as you drive them, and the year adds itself up." />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="trips-title">
          <CardTitle id="trips-title">Trips</CardTitle>
          <ul className="flex flex-col divide-y divide-grey-200" aria-label="Trips">
            {trips.map((trip) => (
              <li key={trip.id} className="flex items-start gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body text-ink">{formatMiles(trip.milesTenths)}</span>
                  <span className="text-small text-grey-700">
                    {formatDate(new Date(`${trip.travelledOn}T12:00:00Z`))} · {trip.vehicleName}
                    {trip.note === null ? '' : ` · ${trip.note}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
