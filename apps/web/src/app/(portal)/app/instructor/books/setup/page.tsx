import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { booksAccess, vehiclesFor } from '@/lib/books/books';
import { formatRegistration } from '@repo/core/vehicle';
import { AddVehicle } from './add-vehicle';
import { RetireVehicle } from './retire-vehicle';
import { VatQuestion } from './vat-question';

export const metadata: Metadata = { title: 'Bookkeeping setup' };

/** MNY-02, MNY-03: the two things the books need to know before they can add anything up. */
export default function BooksSetupPage() {
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
      <PageHeader title="Bookkeeping setup" subtitle="Your cars, and whether you charge VAT." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Setup />
        </Suspense>
      </div>
    </main>
  );
}

const methodWords = {
  mileage: 'Claimed by the mile',
  actual_costs: 'Claimed on what it costs',
} as const;

async function Setup() {
  await connection();
  const access = await booksAccess();
  if (!access?.solo || !access.included) return null;
  const vehicles = await vehiclesFor(access.businessId);

  return (
    <>
      <Card className="flex flex-col gap-3" role="region" aria-labelledby="vat-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="vat-title">VAT</CardTitle>
          <CardDescription>
            Most instructors are not registered. If you are, your figures leave out the VAT you collect and the
            VAT you reclaim.
          </CardDescription>
        </div>
        <VatQuestion registered={access.vatRegistered} number={access.vatNumber ?? ''} />
      </Card>

      <Card className="flex flex-col gap-3" role="region" aria-labelledby="cars-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="cars-title">Your cars</CardTitle>
          <CardDescription>
            Each car is claimed one way or the other: by the mile, or on what it actually costs. The first claim
            you make against a car settles it, and it only changes when you change the car.
          </CardDescription>
        </div>
        {vehicles.length > 0 ? (
          <ul className="flex flex-col divide-y divide-grey-200" aria-label="Your cars">
            {vehicles.map((one) => (
              <li key={one.id} className="flex items-center gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body text-ink">{one.name}</span>
                  <span className="text-small text-grey-700">
                    {[one.year === null ? null : String(one.year), one.registration === null ? null : formatRegistration(one.registration)]
                      .filter((part) => part !== null)
                      .join(' · ')}
                  </span>
                </span>
                {one.claimMethod === null ? (
                  <StatusPill status="pending">Not settled yet</StatusPill>
                ) : (
                  <StatusPill status="confirmed">{methodWords[one.claimMethod]}</StatusPill>
                )}
                <RetireVehicle id={one.id} name={one.name} claimed={one.claimMethod !== null} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-grey-700">No cars yet. Add the one you teach in.</p>
        )}
        <AddVehicle />
      </Card>
    </>
  );
}
