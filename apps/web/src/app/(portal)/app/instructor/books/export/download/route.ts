import { booksAccess, booksFor, booksYearFrom, expensesFor, mileageFor } from '@/lib/books/books';
import { booksCsv, booksFileName, booksPeriod, isBooksPeriod } from '@/lib/books/export';
import { taxYear } from '@repo/core/tax-year';
import type { NextRequest } from 'next/server';

/**
 * A period's books as a CSV file (MNY-04, D-198).
 *
 * A route rather than an action because the answer is a file: the browser saves it, and nothing
 * about it belongs in the page. Who may read it is decided here and again by the database.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const access = await booksAccess();
  if (!access?.solo || !access.included) {
    return new Response('Not allowed', { status: 403 });
  }

  const asked = request.nextUrl.searchParams;
  const year = booksYearFrom(asked.get('year') ?? undefined);
  const periodKey = asked.get('period');
  const period = booksPeriod(year, isBooksPeriod(periodKey) ? periodKey : 'year');

  // Expenses and trips are the period's; the summary is the period's too, so a quarter's figures
  // are a quarter's and not a slice of the year's.
  const asYear = { ...taxYear(year.starts), from: period.from, to: period.to };
  const [summary, expenses, mileage] = await Promise.all([
    booksFor(access.businessId, asYear),
    expensesFor(access.businessId, asYear),
    mileageFor(access.businessId, asYear),
  ]);
  if (!summary) return new Response('Could not read those books', { status: 500 });

  const csv = booksCsv({ businessName: access.businessName, period, summary, expenses, mileage });

  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${booksFileName(access.businessName, period)}"`,
      // A set of books is nobody else's, and no cache anywhere should keep a copy.
      'cache-control': 'private, no-store',
    },
  });
}
