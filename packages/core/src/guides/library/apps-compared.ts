import { brand } from '@repo/config/brand';
import { getEntitlements, plans, standardCardFee } from '@repo/config/plans';
import { formatPence } from '../../money.ts';

/**
 * What the guides say about other driving instructor apps, and about ours, in one place (D-387):
 * every price and feature of another company's is from its own pages, read on the date below, and
 * a guide that compares them says so. When a company changes its prices, this file changes, and
 * every guide that quotes them with it. Ours come from the plans the app itself charges.
 */
export const comparedOn = '2026-10-26';

/** "26 October 2026", as a guide's words give the day the prices were read. */
export const comparedOnWords = '26 October 2026';

export const totalDrive = {
  name: 'Total Drive',
  /** Including VAT, a month, from its pricing page. */
  plans: [
    { name: 'Basic', pence: 1800, onlineBooking: false },
    { name: 'Ultimate', pence: 2300, onlineBooking: true },
    { name: 'Pro', pence: 2400, onlineBooking: false },
    { name: 'Elite', pence: 2600, onlineBooking: true },
  ],
  /** From its information page, updated 22 September 2026. */
  instructors: 'over 9,500',
  pricingUrl: 'https://totaldrive.co.uk/instructor-software-pricing/',
  aboutUrl: 'https://totaldrive.co.uk/ai-info-page/',
  paymentsUrl: 'https://totaldrive.co.uk/take-card-payments/',
} as const;

export const myDriveTime = {
  name: 'MyDriveTime',
  /** For Individuals, a month, from its pricing page. */
  pence: 1900,
  pricingUrl: 'https://www.mydrivetime.co.uk/pricing/',
  homeUrl: 'https://www.mydrivetime.co.uk/',
  diaryUrl: 'https://www.mydrivetime.co.uk/diary-management/',
  financeUrl: 'https://www.mydrivetime.co.uk/finance-management/',
} as const;

export const stripePricingUrl = 'https://stripe.com/gb/pricing';

/** Our own, from the plans the app charges. */
export const ours = {
  freeLearners: String(getEntitlements('free').activeLearners ?? 0),
  proMonthlyPence: plans.pro.monthlyPricePence,
  proMonthly: formatPence(plans.pro.monthlyPricePence),
  proYearly: formatPence(plans.pro.yearlyPricePence ?? plans.pro.monthlyPricePence * 12),
  proTexts: String(getEntitlements('pro').smsRemindersPerMonth),
  schoolMonthly: formatPence(plans.school.schoolFee?.monthlyPricePence ?? 0),
  perInstructorMonthly: formatPence(plans.school.monthlyPricePence),
  /** "1.5% plus 20p", as the pricing page says Stripe's fee for a UK card. */
  cardFee: `${String(standardCardFee.basisPoints / 100)}% plus ${String(standardCardFee.fixedPence)}p`,
} as const;

/** Stripe's standard fee on a lesson at a price, in pence, rounded as Stripe rounds it. */
export function cardFeePence(pricePence: number): number {
  return Math.round((pricePence * standardCardFee.basisPoints) / 10_000) + standardCardFee.fixedPence;
}

/**
 * Twenty five one hour lessons a week, as a month: what a subscription costs for each lesson, in
 * pence, at that price a month.
 */
export function pencePerLesson(monthlyPence: number): number {
  return Math.round(monthlyPence / ((25 * 52) / 12));
}

/** The guide setting our app beside the other two: its address carries the brand, so it is made here. */
export const comparisonSlug = `total-drive-vs-mydrivetime-vs-${brand.name.toLowerCase()}`;
