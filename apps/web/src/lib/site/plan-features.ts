import { plans, type Entitlements, type Plan, type PlanKey } from '@repo/config/plans';
import { formatPence } from '@repo/core/money';

/**
 * What each plan says it includes on the public site (PRD 9.18, M5-09). Prices and entitlements
 * come from `@repo/config/plans`; the words are here. PRD 9.18 lists features that arrive after
 * Phase 1, so each is marked as there now or coming later, and nothing is sold as there that is
 * not (D-116).
 */

interface FeatureWords {
  words: (entitlements: Entitlements) => string;
  /** Built and working today. */
  available: boolean;
}

const entitlementWords: Record<keyof Entitlements, FeatureWords> = {
  smsRemindersPerMonth: { words: (e) => `Text message reminders, up to ${String(e.smsRemindersPerMonth)} a month`, available: true },
  autoChargeBeforeLesson: { words: () => 'Charge the saved card before each lesson', available: true },
  gapFill: { words: () => 'Gap Fill: cancelled lessons offered to your waiting list', available: false },
  waitingListAutomation: { words: () => 'Waiting list automation', available: false },
  expensesAndExports: { words: () => 'Expenses, and exports ready for Making Tax Digital', available: false },
  calendarSync: { words: () => 'Google and Outlook calendar sync', available: false },
  customBookingColours: { words: () => 'Your own colours on your booking page', available: false },
  schoolPortal: { words: () => 'School overview, instructors, learner allocation and school prices', available: true },
  reports: { words: () => 'Reports by instructor', available: false },
  fleet: { words: () => 'Fleet: cars, MOT and insurance dates', available: false },
};

/** What every plan has, the Free plan's list in PRD 9.18. */
const everyPlan = [
  'Diary and bookings',
  'Unlimited learners',
  'Lesson records and progress',
  'Card, cash and bank transfer payments',
  'Public profile and booking link',
  'Email and push reminders',
] as const;

export interface PlanSummary {
  key: PlanKey;
  name: string;
  /** "£12" */
  price: string;
  /** "per month, or £120 a year" */
  cadence: string;
  audience: string;
  /** What it has today. */
  features: string[];
  /** What it will have. */
  later: string[];
  signUpRole: 'instructor' | 'school';
}

function enabled(plan: Plan): (keyof Entitlements)[] {
  return (Object.keys(entitlementWords) as (keyof Entitlements)[]).filter((key) => {
    const value = plan.entitlements[key];
    return typeof value === 'number' ? value > 0 : value;
  });
}

/** Each plan's features, as what the plan below it does not have. */
function summary(plan: Plan, below: Plan | null, audience: string, signUpRole: PlanSummary['signUpRole']): PlanSummary {
  const added = enabled(plan).filter((key) => below === null || !enabled(below).includes(key));
  const lead = below === null ? [...everyPlan] : [`Everything in ${below.label}`];
  const cadence = plan.perInstructor
    ? `per instructor per month, for at least ${String(plan.minimumInstructors)} instructors`
    : plan.monthlyPricePence === 0
      ? 'per month'
      : `per month, or ${formatPence(plan.yearlyPricePence ?? plan.monthlyPricePence * 12)} a year`;
  return {
    key: plan.key,
    name: plan.label,
    price: formatPence(plan.monthlyPricePence),
    cadence,
    audience,
    features: [...lead, ...added.filter((key) => entitlementWords[key].available).map((key) => entitlementWords[key].words(plan.entitlements))],
    later: added.filter((key) => !entitlementWords[key].available).map((key) => entitlementWords[key].words(plan.entitlements)),
    signUpRole,
  };
}

export function planSummaries(): PlanSummary[] {
  return [
    summary(plans.free, null, 'For independent instructors', 'instructor'),
    summary(plans.pro, plans.free, 'For independent instructors who want more', 'instructor'),
    summary(plans.school, plans.pro, 'For driving schools', 'school'),
  ];
}
