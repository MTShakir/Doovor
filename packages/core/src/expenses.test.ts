import { describe, expect, it } from 'vitest';
import {
  allExpenseCategories,
  expenseCategories,
  expenseCategory,
  isExpenseCategory,
  sa103HeadingLabels,
  sa103Headings,
  totalsByHeading,
  vehicleRunningCategories,
} from './expenses.ts';

describe('what an instructor spends money on (MNY-02, D-198)', () => {
  it('covers everything the PRD names', () => {
    const labels = allExpenseCategories().map((one) => one.label);
    for (const named of ['Fuel', 'Car finance', 'Car insurance', 'Servicing and repairs', 'Franchise fee', 'ADI registration', 'Training']) {
      expect(labels).toContain(named);
    }
  });

  it('gives every category a heading the return actually has', () => {
    for (const one of allExpenseCategories()) {
      expect(sa103Headings).toContain(one.heading);
      expect(sa103HeadingLabels[one.heading].length).toBeGreaterThan(0);
      expect(one.hint.length).toBeGreaterThan(0);
    }
  });

  it('knows which costs belong to running a vehicle', () => {
    expect(vehicleRunningCategories().sort()).toEqual(['fuel', 'servicing', 'vehicle_finance', 'vehicle_insurance']);
    expect(expenseCategory('franchise_fee').vehicleRunning).toBe(false);
  });

  it('says so where whether it counts depends on the detail, rather than deciding', () => {
    expect(expenseCategory('training').care).toContain('qualifies you for something new');
    expect(expenseCategory('phone').care).toContain('share you use for work');
    expect(expenseCategory('vehicle_finance').care).toContain('interest');
    expect(expenseCategory('fuel').care).toBeUndefined();
  });

  it('reads only the categories it knows', () => {
    expect(isExpenseCategory('fuel')).toBe(true);
    expect(isExpenseCategory('yacht')).toBe(false);
    expect(isExpenseCategory(7)).toBe(false);
  });
});

describe('totalling under the headings of the return', () => {
  it('adds each category under its heading, in the order the pages list them', () => {
    const totals = totalsByHeading([
      { category: 'fuel', amountPence: 5000 },
      { category: 'servicing', amountPence: 12000 },
      { category: 'franchise_fee', amountPence: 20000 },
      { category: 'advertising', amountPence: 3000 },
      { category: 'training', amountPence: 8000 },
    ]);
    expect(totals).toEqual([
      { heading: 'car_van_travel', label: 'Car, van and travel expenses', totalPence: 17000 },
      { heading: 'advertising', label: 'Advertising and business entertainment costs', totalPence: 3000 },
      { heading: 'other', label: 'Other business expenses', totalPence: 28000 },
    ]);
  });

  it('leaves out a heading with nothing under it, and adds up to nothing at all', () => {
    expect(totalsByHeading([])).toEqual([]);
    const one = totalsByHeading([{ category: 'phone', amountPence: 1500 }]);
    expect(one).toHaveLength(1);
    expect(one[0]?.heading).toBe('phone_office');
  });

  it('has a hint and a label for every category it knows', () => {
    expect(allExpenseCategories()).toHaveLength(expenseCategories.length);
  });
});
