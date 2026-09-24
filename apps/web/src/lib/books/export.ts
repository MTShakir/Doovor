import 'server-only';
import { brand } from '@repo/config/brand';
import { csvPence, toCsv, type CsvValue } from '@repo/core/csv-write';
import { expenseCategory, sa103HeadingLabels, sa103Summary } from '@repo/core/expenses';
import { formatMiles } from '@repo/core/mileage';
import { mtdQuarters, type MtdQuarter, type TaxYear } from '@repo/core/tax-year';
import type { BooksSummary } from '@repo/core/books';
import type { ExpenseRow, MileageRow } from '@/lib/books/books';

/** A whole tax year, or one of its four quarterly periods (MNY-04). */
export type BooksPeriodKey = 'year' | 'q1' | 'q2' | 'q3' | 'q4';

export const booksPeriodKeys: readonly BooksPeriodKey[] = ['year', 'q1', 'q2', 'q3', 'q4'];

export function isBooksPeriod(value: unknown): value is BooksPeriodKey {
  return typeof value === 'string' && (booksPeriodKeys as readonly string[]).includes(value);
}

export interface BooksPeriod {
  key: BooksPeriodKey;
  label: string;
  from: string;
  to: string;
  range: string;
}

/** The days a chosen period covers. */
export function booksPeriod(year: TaxYear, key: BooksPeriodKey): BooksPeriod {
  if (key === 'year') {
    return { key, label: `${year.label} tax year`, from: year.from, to: year.to, range: year.range };
  }
  const quarters: MtdQuarter[] = mtdQuarters(year.starts);
  const index = Number(key.slice(1)) - 1;
  const quarter = quarters[index] ?? quarters[0];
  if (!quarter) return { key, label: year.label, from: year.from, to: year.to, range: year.range };
  return { key, label: `${quarter.label}, ${year.label}`, from: quarter.from, to: quarter.to, range: quarter.range };
}

/**
 * A period's books as one CSV: the summary first, then every expense and every trip behind it
 * (MNY-04). An accountant reads the top and checks the rest; MTD software reads the rows.
 */
export function booksCsv(input: {
  businessName: string;
  period: BooksPeriod;
  summary: BooksSummary;
  expenses: ExpenseRow[];
  mileage: MileageRow[];
}): string {
  const rows: CsvValue[][] = [
    [input.businessName],
    [input.period.label, input.period.range],
    [`Prepared by ${brand.name}. Check these figures before filing.`],
    [],
    ['Summary'],
    [sa103Summary.turnover, csvPence(input.summary.turnoverPence)],
    [sa103Summary.totalExpenses, csvPence(input.summary.totalExpensesPence)],
    [sa103Summary.netProfit, csvPence(input.summary.netProfitPence)],
  ];

  if (input.summary.vatRegistered) {
    rows.push(['VAT on sales, not counted as turnover', csvPence(input.summary.vatOnSalesPence)]);
    rows.push(['VAT reclaimed, not counted as an expense', csvPence(input.summary.vatReclaimedPence)]);
  }

  rows.push([], ['Expenses by heading']);
  for (const line of input.summary.expenseLines) {
    rows.push([line.label, csvPence(line.totalPence)]);
  }

  rows.push([], ['Every expense'], ['Date', 'What for', 'Heading', 'Amount', 'VAT', 'Car', 'Note', 'Receipt']);
  for (const one of input.expenses) {
    const info = expenseCategory(one.category);
    rows.push([
      one.spentOn,
      info.label,
      sa103HeadingLabels[info.heading],
      csvPence(one.amountPence),
      csvPence(one.vatPence),
      one.vehicleName ?? '',
      one.note ?? '',
      one.receiptPath === null ? 'No' : 'Yes',
    ]);
  }

  rows.push([], ['Every trip'], ['Date', 'Car', 'Miles', 'Note']);
  for (const trip of input.mileage) {
    rows.push([trip.travelledOn, trip.vehicleName, formatMiles(trip.milesTenths).replace(/ miles?$/, ''), trip.note ?? '']);
  }

  return toCsv(rows);
}

/** What the downloaded file is called: the Business, the period, and nothing a filesystem minds. */
export function booksFileName(businessName: string, period: BooksPeriod): string {
  const tidy = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${tidy === '' ? 'books' : tidy}-${period.key}-${period.from}.csv`;
}
