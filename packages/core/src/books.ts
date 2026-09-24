/**
 * A year's trading, turned into the figures a return asks for (MNY-04, D-198).
 *
 * Cash basis: money counts on the day it moved. Turnover is what learners paid, less what went
 * back to them. Expenses are what was recorded, plus what the payments provider kept, plus the
 * mileage claim for the cars claimed by the mile.
 *
 * VAT changes both ends. A Business that is registered charges 20% on tuition and hands it to
 * HMRC, so that part was never its income; and it reclaims the VAT inside what it bought, so that
 * part was never its expense. A Business that is not registered has neither, and every figure is
 * simply what it paid and was paid.
 *
 * Nothing here reads a clock or a database. It is given the year's facts and returns the summary.
 */

import { expenseCategory, totalsByHeading, type ExpenseCategory, type Sa103Heading } from './expenses.ts';
import { mileageBands, mileageClaimPence } from './mileage.ts';
import { sa103Form, type Sa103Form } from './tax-year.ts';

/** Tuition is standard rated: an instructor is not an eligible body, so the education exemption does not apply. */
export const vatRatePercent = 20;

export interface BooksFacts {
  vatRegistered: boolean;
  payments: { totalPence: number; cardPence: number; count: number };
  refunds: { totalPence: number; count: number };
  providerFees: { totalPence: number; unknownCount: number };
  expenses: { category: ExpenseCategory; totalPence: number; vatPence: number; count: number }[];
  mileage: { tenths: number; trips: number };
}

export interface BooksLine {
  heading: Sa103Heading | 'mileage' | 'provider_fees';
  label: string;
  totalPence: number;
}

export interface BooksSummary {
  taxYearStarts: number;
  vatRegistered: boolean;
  /** What learners paid, less what went back, and less the VAT in it when registered. */
  turnoverPence: number;
  /** The VAT inside what learners paid, which belongs to HMRC and was never income. */
  vatOnSalesPence: number;
  /** The VAT inside what was bought, which is reclaimed and so was never an expense. */
  vatReclaimedPence: number;
  /** Every expense line, in the order the pages list them, with mileage and fees at the end. */
  expenseLines: BooksLine[];
  totalExpensesPence: number;
  /** Turnover less expenses. Negative when the year made a loss, which a return allows for. */
  netProfitPence: number;
  /** Which self-employment pages this turnover needs. */
  form: Sa103Form;
  /** Card payments whose fee the provider has not told us yet, so a screen can say so. */
  feesStillSettling: number;
  mileage: { tenths: number; trips: number; claimPence: number; bands: ReturnType<typeof mileageBands> };
}

/** The VAT inside a gross amount, at the standard rate. Rounded to the penny, HMRC's way. */
export function vatWithin(grossPence: number): number {
  if (grossPence <= 0) return 0;
  return Math.round((grossPence * vatRatePercent) / (100 + vatRatePercent));
}

export function summariseBooks(facts: BooksFacts, taxYearStarts: number): BooksSummary {
  const grossTakings = Math.max(0, facts.payments.totalPence - facts.refunds.totalPence);
  const vatOnSales = facts.vatRegistered ? vatWithin(grossTakings) : 0;
  const turnoverPence = grossTakings - vatOnSales;

  // Registered means the VAT inside a purchase comes back, so it is not part of the cost.
  const vatReclaimedPence = facts.vatRegistered
    ? facts.expenses.reduce((total, one) => total + one.vatPence, 0)
    : 0;
  const recorded = facts.expenses.map((one) => ({
    category: one.category,
    amountPence: facts.vatRegistered ? one.totalPence - one.vatPence : one.totalPence,
  }));

  const claimPence = mileageClaimPence(facts.mileage.tenths, taxYearStarts);
  const lines: BooksLine[] = totalsByHeading(recorded);
  if (claimPence > 0) {
    lines.push({ heading: 'mileage', label: 'Mileage at the approved rates', totalPence: claimPence });
  }
  if (facts.providerFees.totalPence > 0) {
    lines.push({ heading: 'provider_fees', label: 'What it cost to take card payments', totalPence: facts.providerFees.totalPence });
  }

  const totalExpensesPence = lines.reduce((total, line) => total + line.totalPence, 0);

  return {
    taxYearStarts,
    vatRegistered: facts.vatRegistered,
    turnoverPence,
    vatOnSalesPence: vatOnSales,
    vatReclaimedPence,
    expenseLines: lines,
    totalExpensesPence,
    netProfitPence: turnoverPence - totalExpensesPence,
    form: sa103Form(turnoverPence),
    feesStillSettling: facts.providerFees.unknownCount,
    mileage: {
      tenths: facts.mileage.tenths,
      trips: facts.mileage.trips,
      claimPence,
      bands: mileageBands(facts.mileage.tenths, taxYearStarts),
    },
  };
}

/** Every expense of the year under its own category name, for a screen that lists them. */
export function expenseTotals(
  facts: BooksFacts,
): { category: ExpenseCategory; label: string; totalPence: number; count: number }[] {
  return facts.expenses
    .map((one) => ({ category: one.category, label: expenseCategory(one.category).label, totalPence: one.totalPence, count: one.count }))
    .sort((a, b) => b.totalPence - a.totalPence);
}
