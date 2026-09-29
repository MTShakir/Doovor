import { formatPence } from '@repo/core/money';
import { formatMiles } from '@repo/core/mileage';
import { sa103Summary } from '@repo/core/expenses';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Fragment, Suspense } from 'react';
import { ProUpsell } from '@/components/pro';
import { booksAccess, booksFor, booksYearFrom, booksYears } from '@/lib/books/books';

export const metadata: Metadata = { title: 'Bookkeeping' };

/** The rest of the books, in the order somebody works through them. */
const booksLinks = [
  { href: '/app/instructor/books/expenses', title: 'Expenses', subtitle: 'What you spent, with the receipts' },
  { href: '/app/instructor/books/mileage', title: 'Mileage', subtitle: 'The miles you drove for work' },
  { href: '/app/instructor/books/export', title: 'Export', subtitle: 'A year or a quarter, for your accountant' },
  { href: '/app/instructor/books/setup', title: 'Setup', subtitle: 'Your cars, and whether you charge VAT' },
] as const;

/** MNY-02, MNY-03, MNY-04: a solo instructor's books, a tax year at a time. */
export default function BooksPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Bookkeeping" subtitle="What you took, what you spent, and what is left." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Books searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Books({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  await connection();
  const access = await booksAccess();
  if (!access) return null;

  if (!access.solo) {
    return (
      <Card padding="none">
        <EmptyState
          icon={BookOpen}
          title="Coming soon for schools"
          description="A school's books need commission and instructor settlements, which we are still working on. Instructors running their own business can keep theirs now."
        />
      </Card>
    );
  }

  if (!access.included) {
    return (
      <ProUpsell
        feature="Bookkeeping"
        description="Keep your expenses and mileage here, and hand your accountant a year in one file."
      />
    );
  }

  const year = booksYearFrom((await searchParams).year);
  const years = booksYears();
  const summary = await booksFor(access.businessId, year);
  if (!summary) return null;

  return (
    <>
      {/* A tax year is a choice of one, so they sit across rather than in a menu. */}
      <nav aria-label="Tax year" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {years.map((one) => (
          <Link
            key={one.starts}
            href={one.starts === years[0]?.starts ? '/app/instructor/books' : `/app/instructor/books?year=${String(one.starts)}`}
            aria-current={one.starts === year.starts ? 'page' : undefined}
            className={`flex h-12 items-center justify-center rounded-full px-2 text-center text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
              one.starts === year.starts ? 'bg-black text-white' : 'bg-quiet text-black hover:bg-quiet-strong'
            }`}
          >
            {one.label}
          </Link>
        ))}
      </nav>

      <Card className="flex flex-col gap-4" role="region" aria-labelledby="books-year-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="books-year-title">{year.label} tax year</CardTitle>
          <CardDescription>{year.range}</CardDescription>
        </div>
        <div className="flex flex-col">
          <ListRow title={sa103Summary.turnover} trailing={formatPence(summary.turnoverPence)} />
          <ListDivider />
          <ListRow title={sa103Summary.totalExpenses} trailing={formatPence(summary.totalExpensesPence)} />
          <ListDivider />
          <ListRow
            title={sa103Summary.netProfit}
            trailing={formatPence(summary.netProfitPence)}
            subtitle={summary.netProfitPence < 0 ? 'A loss this year' : undefined}
          />
        </div>
        {summary.vatRegistered ? (
          <p className="text-small text-grey-700">
            You are registered for VAT, so these leave out the {formatPence(summary.vatOnSalesPence)} of VAT in what
            learners paid and the {formatPence(summary.vatReclaimedPence)} you reclaim on what you bought.
          </p>
        ) : null}
        {summary.feesStillSettling > 0 ? (
          <p className="text-small text-grey-700">
            {summary.feesStillSettling === 1
              ? 'One card payment is still settling, so what it cost is not counted yet.'
              : `${String(summary.feesStillSettling)} card payments are still settling, so what they cost is not counted yet.`}
          </p>
        ) : null}
      </Card>

      {summary.expenseLines.length > 0 ? (
        <Card className="flex flex-col gap-3" role="region" aria-labelledby="books-lines-title">
          <div className="flex flex-col gap-1">
            <CardTitle id="books-lines-title">Your expenses, as the return asks for them</CardTitle>
            <CardDescription>Each line is a heading on the self-employment pages.</CardDescription>
          </div>
          <div className="flex flex-col">
            {summary.expenseLines.map((line, index) => (
              <Fragment key={line.heading}>
                {index === 0 ? null : <ListDivider />}
                <ListRow title={line.label} trailing={formatPence(line.totalPence)} />
              </Fragment>
            ))}
          </div>
          {summary.mileage.claimPence > 0 ? (
            <p className="text-small text-grey-700">
              {formatMiles(summary.mileage.tenths)} over {String(summary.mileage.trips)}{' '}
              {summary.mileage.trips === 1 ? 'trip' : 'trips'}, at the approved rates.
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card padding="none">
        <nav aria-label="Your books" className="flex flex-col">
          {booksLinks.map((link, index) => (
            <Fragment key={link.href}>
              {index === 0 ? null : <ListDivider />}
              <ListRow asChild title={link.title} subtitle={link.subtitle} chevron>
                <Link href={link.href} />
              </ListRow>
            </Fragment>
          ))}
        </nav>
      </Card>
    </>
  );
}
