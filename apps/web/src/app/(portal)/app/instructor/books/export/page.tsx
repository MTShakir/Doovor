import { formatPence } from '@repo/core/money';
import { sa103Summary } from '@repo/core/expenses';
import { mtdQuarters } from '@repo/core/tax-year';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Fragment, Suspense } from 'react';
import { booksAccess, booksFor, booksYearFrom } from '@/lib/books/books';
import { PrintThis } from '@/app/(account)/account/data/print-this';

export const metadata: Metadata = { title: 'Export' };

/** MNY-04: a year or a quarter, in a shape an accountant or MTD software can work from. */
export default function BooksExportPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <div className="px-4 pt-4 md:px-8 print:hidden">
        <Link
          href="/app/instructor/books"
          className="inline-flex min-h-12 items-center gap-1 text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden />
          Bookkeeping
        </Link>
      </div>
      <PageHeader title="Export" subtitle="A year or a quarter, for your accountant or your MTD software." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Export searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Export({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  await connection();
  const access = await booksAccess();
  if (!access?.solo || !access.included) return null;

  const year = booksYearFrom((await searchParams).year);
  const summary = await booksFor(access.businessId, year);
  if (!summary) return null;
  const quarters = mtdQuarters(year.starts);

  return (
    <>
      <Card className="flex flex-col gap-4" role="region" aria-labelledby="export-year-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="export-year-title">{year.label} tax year</CardTitle>
          <CardDescription>{year.range}</CardDescription>
        </div>
        <dl className="flex flex-col">
          <ListRow title={sa103Summary.turnover} trailing={formatPence(summary.turnoverPence)} />
          <ListDivider />
          <ListRow title={sa103Summary.totalExpenses} trailing={formatPence(summary.totalExpensesPence)} />
          <ListDivider />
          <ListRow title={sa103Summary.netProfit} trailing={formatPence(summary.netProfitPence)} />
        </dl>
        <div className="flex flex-col gap-2 print:hidden">
          <Button asChild>
            <a href={`/app/instructor/books/export/download?year=${String(year.starts)}&period=year`}>
              <Download className="size-5" aria-hidden />
              The whole year as a CSV
            </a>
          </Button>
          {/* The same page, printed. Every browser and phone saves one as a PDF (D-148). */}
          <PrintThis />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 print:hidden" role="region" aria-labelledby="export-quarters-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="export-quarters-title">By quarter</CardTitle>
          <CardDescription>
            The four periods Making Tax Digital reports in, if your software asks for them one at a time.
          </CardDescription>
        </div>
        <div className="flex flex-col">
          {quarters.map((quarter, index) => (
            <Fragment key={quarter.quarter}>
              {index === 0 ? null : <ListDivider />}
              <ListRow
                title={quarter.label}
                subtitle={quarter.range}
                trailing={
                  <Button variant="secondary" asChild>
                    <a href={`/app/instructor/books/export/download?year=${String(year.starts)}&period=q${String(quarter.quarter)}`}>
                      <Download className="size-5" aria-hidden />
                      CSV
                    </a>
                  </Button>
                }
              />
            </Fragment>
          ))}
        </div>
      </Card>

      <p className="text-small text-grey-700">
        These figures are worked out on the cash basis, which is what most instructors use. Your accountant
        files the return; this is what they need to do it.
      </p>
    </>
  );
}
