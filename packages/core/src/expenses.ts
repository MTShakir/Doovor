/**
 * What a driving instructor spends money on, and where it lands on a tax return (MNY-02, D-198).
 *
 * Categories carry the self-employment pages' own heading wording rather than a box number. The
 * headings are what an accountant or MTD software fills against and they have not moved in years;
 * the numbers beside them differ between the short and full pages and between years, and a number
 * we asserted wrongly would be worse than no number at all. The three figures a return turns on
 * are named in `sa103Summary` below, because those are the ones every version agrees about.
 *
 * Two rules about claiming live here because they decide what the app may let somebody record:
 * a vehicle on the mileage rate cannot also claim what it costs to run, and some costs are
 * allowable only depending on the detail, which the app says rather than decides.
 */

export type Sa103Heading =
  | 'car_van_travel'
  | 'phone_office'
  | 'advertising'
  | 'professional_fees'
  | 'financial_charges'
  | 'other';

/** The self-employment pages' own words for each heading. */
export const sa103HeadingLabels: Record<Sa103Heading, string> = {
  car_van_travel: 'Car, van and travel expenses',
  phone_office: 'Phone, fax, stationery and other office costs',
  advertising: 'Advertising and business entertainment costs',
  professional_fees: 'Accountancy, legal and other professional fees',
  financial_charges: 'Bank, credit card and other financial charges',
  other: 'Other business expenses',
};

export const sa103Headings = Object.keys(sa103HeadingLabels) as Sa103Heading[];

/** The three figures every version of the pages agrees about, short and full alike. */
export const sa103Summary = {
  turnover: 'Your turnover',
  totalExpenses: 'Total expenses',
  netProfit: 'Net profit',
} as const;

export const expenseCategories = [
  'fuel',
  'vehicle_finance',
  'vehicle_insurance',
  'servicing',
  'franchise_fee',
  'adi_registration',
  'training',
  'phone',
  'advertising',
  'accountancy',
  'bank_charges',
  'other',
] as const;

export type ExpenseCategory = (typeof expenseCategories)[number];

export interface ExpenseCategoryInfo {
  key: ExpenseCategory;
  /** What an instructor calls it. */
  label: string;
  /** What it covers, in the same words. */
  hint: string;
  heading: Sa103Heading;
  /**
   * True when it is part of what a vehicle costs to run. Those cannot be claimed for a vehicle
   * that claims the mileage rate instead, which is the whole point of the rate.
   */
  vehicleRunning: boolean;
  /** Set when whether it counts depends on the detail. The app shows this and decides nothing. */
  care?: string;
}

const categories: Record<ExpenseCategory, Omit<ExpenseCategoryInfo, 'key'>> = {
  fuel: {
    label: 'Fuel',
    hint: 'Petrol, diesel or charging for the car you teach in.',
    heading: 'car_van_travel',
    vehicleRunning: true,
  },
  vehicle_finance: {
    label: 'Car finance',
    hint: 'Lease or hire purchase payments on the car you teach in.',
    heading: 'car_van_travel',
    vehicleRunning: true,
    care: 'On hire purchase only the interest counts as an expense. Your accountant treats the rest as the car itself.',
  },
  vehicle_insurance: {
    label: 'Car insurance',
    hint: 'Insuring the car for driving tuition.',
    heading: 'car_van_travel',
    vehicleRunning: true,
  },
  servicing: {
    label: 'Servicing and repairs',
    hint: 'Services, MOT, tyres, repairs and breakdown cover.',
    heading: 'car_van_travel',
    vehicleRunning: true,
  },
  franchise_fee: {
    label: 'Franchise fee',
    hint: 'What you pay a driving school each week or month.',
    heading: 'other',
    vehicleRunning: false,
    care: 'If your franchise fee covers the car, it belongs with what the car costs instead. Ask your accountant which yours is.',
  },
  adi_registration: {
    label: 'ADI registration',
    hint: 'Your badge, your DBS check and the DVSA standards check.',
    heading: 'other',
    vehicleRunning: false,
  },
  training: {
    label: 'Training',
    hint: 'Courses and continuing professional development.',
    heading: 'other',
    vehicleRunning: false,
    care: 'Keeping your existing skills up to date counts. Training that qualifies you for something new usually does not.',
  },
  phone: {
    label: 'Phone and office',
    hint: 'Your mobile bill, stationery, printing and software you pay for.',
    heading: 'phone_office',
    vehicleRunning: false,
    care: 'Claim the share you use for work, not the whole bill.',
  },
  advertising: {
    label: 'Advertising',
    hint: 'Listings, leaflets, signage and anything you pay to be found.',
    heading: 'advertising',
    vehicleRunning: false,
  },
  accountancy: {
    label: 'Accountancy and legal',
    hint: 'Your accountant, and legal or other professional advice.',
    heading: 'professional_fees',
    vehicleRunning: false,
  },
  bank_charges: {
    label: 'Bank and card charges',
    hint: 'Account fees, and what a card payment costs you to take.',
    heading: 'financial_charges',
    vehicleRunning: false,
  },
  other: {
    label: 'Something else',
    hint: 'Anything for the business that none of the others covers.',
    heading: 'other',
    vehicleRunning: false,
  },
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (expenseCategories as readonly string[]).includes(value);
}

export function expenseCategory(key: ExpenseCategory): ExpenseCategoryInfo {
  return { key, ...categories[key] };
}

/** Every category, in the order an instructor meets them. */
export function allExpenseCategories(): ExpenseCategoryInfo[] {
  return expenseCategories.map(expenseCategory);
}

/** What a vehicle on the mileage rate may not also claim (MNY-03). */
export function vehicleRunningCategories(): ExpenseCategory[] {
  return expenseCategories.filter((key) => categories[key].vehicleRunning);
}

/**
 * Totals under each heading of the return, in the order the pages list them. Headings with
 * nothing under them are left out: a return does not show an empty line.
 */
export function totalsByHeading(
  entries: readonly { category: ExpenseCategory; amountPence: number }[],
): { heading: Sa103Heading; label: string; totalPence: number }[] {
  const totals = new Map<Sa103Heading, number>();
  for (const entry of entries) {
    const heading = categories[entry.category].heading;
    totals.set(heading, (totals.get(heading) ?? 0) + entry.amountPence);
  }
  return sa103Headings
    .filter((heading) => totals.has(heading))
    .map((heading) => ({ heading, label: sa103HeadingLabels[heading], totalPence: totals.get(heading) ?? 0 }));
}
