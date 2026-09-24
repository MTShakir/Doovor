import { expenseCategory } from '@repo/core/expenses';
import { formatPence } from '@repo/core/money';
import { formatDate, todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, ReceiptText } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { booksAccess, booksYearFrom, expensesFor, vehiclesFor } from '@/lib/books/books';
import { AddExpense } from './add-expense';
import { RemoveExpense } from './remove-expense';

export const metadata: Metadata = { title: 'Expenses' };

/** MNY-02: what an instructor spent, a tax year at a time. */
export default function ExpensesPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
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
      <PageHeader title="Expenses" subtitle="What you spent, with the receipts." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Expenses searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Expenses({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  await connection();
  const access = await booksAccess();
  if (!access?.solo || !access.included) return null;

  const year = booksYearFrom((await searchParams).year);
  const [rows, vehicles] = await Promise.all([expensesFor(access.businessId, year), vehiclesFor(access.businessId)]);
  const total = rows.reduce((sum, one) => sum + one.amountPence, 0);

  return (
    <>
      <AddExpense
        businessId={access.businessId}
        today={todayInZone()}
        vatRegistered={access.vatRegistered}
        vehicles={vehicles.map((one) => ({ id: one.id, name: one.name, byMile: one.claimMethod === 'mileage' }))}
      />

      {rows.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={ReceiptText}
            title="Nothing recorded yet"
            description="Add what you spend as you go, and the year adds itself up."
          />
        </Card>
      ) : (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="expenses-title">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle id="expenses-title">{year.label}</CardTitle>
            <span className="text-body text-ink tabular-nums">{formatPence(total)}</span>
          </div>
          <CardDescription>
            {rows.length === 1 ? '1 expense' : `${String(rows.length)} expenses`} in this tax year.
          </CardDescription>
          <ul className="flex flex-col divide-y divide-grey-200" aria-label="Expenses">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body text-ink">{expenseCategory(row.category).label}</span>
                  <span className="text-small text-grey-700">
                    {formatDate(new Date(`${row.spentOn}T12:00:00Z`))}
                    {row.vehicleName === null ? '' : ` · ${row.vehicleName}`}
                    {row.note === null ? '' : ` · ${row.note}`}
                    {row.receiptPath === null ? '' : ' · Receipt'}
                  </span>
                </span>
                <span className="shrink-0 text-body text-ink tabular-nums">{formatPence(row.amountPence)}</span>
                <RemoveExpense id={row.id} label={expenseCategory(row.category).label} amountPence={row.amountPence} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
