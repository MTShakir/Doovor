import { describe, expect, it } from 'vitest';
import { expenseTotals, summariseBooks, vatWithin, type BooksFacts } from './books.ts';

/** A year an instructor would recognise: about thirty thousand pounds of lessons and the usual costs. */
function aYear(overrides: Partial<BooksFacts> = {}): BooksFacts {
  return {
    vatRegistered: false,
    payments: { totalPence: 3_000_000, cardPence: 2_000_000, count: 600 },
    refunds: { totalPence: 12_000, count: 3 },
    providerFees: { totalPence: 42_000, unknownCount: 0 },
    expenses: [
      { category: 'fuel', totalPence: 240_000, vatPence: 40_000, count: 52 },
      { category: 'franchise_fee', totalPence: 780_000, vatPence: 130_000, count: 52 },
      { category: 'adi_registration', totalPence: 30_000, vatPence: 0, count: 1 },
      { category: 'phone', totalPence: 24_000, vatPence: 4_000, count: 12 },
    ],
    mileage: { tenths: 0, trips: 0 },
    ...overrides,
  };
}

describe('a year turned into a return (MNY-04, D-198)', () => {
  it('counts what came in less what went back, on the cash basis', () => {
    const summary = summariseBooks(aYear(), 2026);
    expect(summary.turnoverPence).toBe(3_000_000 - 12_000);
    expect(summary.vatOnSalesPence).toBe(0);
  });

  it('adds what the provider kept to the expenses, because it never reached the Business', () => {
    const summary = summariseBooks(aYear(), 2026);
    const fees = summary.expenseLines.find((line) => line.heading === 'provider_fees');
    expect(fees?.totalPence).toBe(42_000);
    expect(summary.totalExpensesPence).toBe(240_000 + 780_000 + 30_000 + 24_000 + 42_000);
  });

  it('works out the profit, and which pages the return needs', () => {
    const summary = summariseBooks(aYear(), 2026);
    expect(summary.netProfitPence).toBe(summary.turnoverPence - summary.totalExpensesPence);
    expect(summary.form).toBe('short');
    // Over ninety thousand pounds the short pages are not enough.
    const busy = summariseBooks(aYear({ payments: { totalPence: 9_500_000, cardPence: 0, count: 1 } }), 2026);
    expect(busy.form).toBe('full');
  });

  it('allows for a year that made a loss', () => {
    const lean = summariseBooks(
      aYear({ payments: { totalPence: 50_000, cardPence: 0, count: 2 }, refunds: { totalPence: 0, count: 0 } }),
      2026,
    );
    expect(lean.netProfitPence).toBeLessThan(0);
  });
});

describe('what VAT registration changes', () => {
  it('takes the VAT out of takings, because that part belongs to HMRC', () => {
    const registered = summariseBooks(aYear({ vatRegistered: true }), 2026);
    const gross = 3_000_000 - 12_000;
    expect(registered.vatOnSalesPence).toBe(vatWithin(gross));
    expect(registered.turnoverPence).toBe(gross - vatWithin(gross));
  });

  it('and out of what was bought, because it comes back', () => {
    const registered = summariseBooks(aYear({ vatRegistered: true }), 2026);
    expect(registered.vatReclaimedPence).toBe(40_000 + 130_000 + 0 + 4_000);
    const travel = registered.expenseLines.find((line) => line.heading === 'car_van_travel');
    expect(travel?.totalPence).toBe(240_000 - 40_000);
  });

  it('leaves both alone for a Business that is not registered', () => {
    const plain = summariseBooks(aYear(), 2026);
    expect(plain.vatOnSalesPence).toBe(0);
    expect(plain.vatReclaimedPence).toBe(0);
    const travel = plain.expenseLines.find((line) => line.heading === 'car_van_travel');
    expect(travel?.totalPence).toBe(240_000);
  });

  it('reads the VAT inside a gross amount at the standard rate', () => {
    expect(vatWithin(12_000)).toBe(2_000);
    expect(vatWithin(0)).toBe(0);
    expect(vatWithin(-5)).toBe(0);
  });
});

describe('mileage in the books', () => {
  it('claims the miles of the cars that are claimed by the mile', () => {
    const driven = summariseBooks(aYear({ mileage: { tenths: 120_000, trips: 400 } }), 2026);
    // Ten thousand miles at 45p, then two thousand at 25p.
    expect(driven.mileage.claimPence).toBe(450_000 + 50_000);
    expect(driven.expenseLines.find((line) => line.heading === 'mileage')?.totalPence).toBe(500_000);
    expect(driven.mileage.bands).toHaveLength(2);
  });

  it('adds no line at all when nothing was driven', () => {
    expect(summariseBooks(aYear(), 2026).expenseLines.some((line) => line.heading === 'mileage')).toBe(false);
  });
});

describe('what a screen shows', () => {
  it('lists the categories largest first, under the words an instructor uses', () => {
    const totals = expenseTotals(aYear());
    expect(totals[0]?.label).toBe('Franchise fee');
    expect(totals.map((one) => one.totalPence)).toEqual([780_000, 240_000, 30_000, 24_000]);
  });

  it('says how many card fees are still settling', () => {
    const waiting = summariseBooks(aYear({ providerFees: { totalPence: 0, unknownCount: 4 } }), 2026);
    expect(waiting.feesStillSettling).toBe(4);
    expect(waiting.expenseLines.some((line) => line.heading === 'provider_fees')).toBe(false);
  });
});
