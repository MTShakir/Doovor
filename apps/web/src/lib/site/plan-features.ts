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
  activeLearners: {
    words: (e) => (e.activeLearners === null ? 'Unlimited learners' : `Up to ${String(e.activeLearners)} learners at once`),
    available: true,
  },
  smsRemindersPerMonth: { words: (e) => `Text message reminders, up to ${String(e.smsRemindersPerMonth)} a month`, available: true },
  autoChargeBeforeLesson: { words: () => 'Charge the saved card before each lesson', available: true },
  gapFill: { words: () => 'Gap Fill: cancelled lessons offered to your waiting list', available: false },
  waitingListAutomation: { words: () => 'Waiting list automation', available: false },
  expensesAndExports: { words: () => 'Expenses, mileage and exports ready for Making Tax Digital', available: true },
  calendarSync: { words: () => 'Google and Outlook calendar sync', available: false },
  customBookingColours: { words: () => 'Your own colours on your booking page', available: true },
  schoolPortal: { words: () => 'School overview, instructors, learner allocation and school prices', available: true },
  reports: { words: () => 'Reports by instructor', available: false },
  fleet: { words: () => 'Fleet: cars, MOT and insurance dates', available: false },
};

/**
 * What is coming to a plan and is not an entitlement, because there is nothing yet to entitle
 * (D-116: sold as coming, never as there). Entitlements that exist but are not built yet carry
 * `available: false` above and are added to these. Each plan above inherits these, the same way it
 * inherits the features (D-212).
 */
const alsoComing: Record<PlanKey, string[]> = {
  free: ['Messages: in-app chat with your learners'],
  pro: ['AI Assistant'],
  school: [],
};

/** What every plan has, the Free plan's list in PRD 9.18. How many learners is an entitlement. */
const everyPlan = [
  'Diary and bookings',
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
    // A limit is not a switch: null is no limit at all, which is the most a plan can give.
    if (key === 'activeLearners') return true;
    return typeof value === 'number' ? value > 0 : value;
  });
}

/** Each plan's features, as what the plan below it does not have. */
function summary(plan: Plan, below: Plan | null, audience: string, signUpRole: PlanSummary['signUpRole']): PlanSummary {
  // What this plan adds: something the plan below does not have, or has less of. Comparing the
  // values rather than the keys is what makes "up to 10 learners" become "unlimited" one plan up.
  const added = enabled(plan).filter(
    (key) => below === null || !enabled(below).includes(key) || plan.entitlements[key] !== below.entitlements[key],
  );
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
    later: [
      ...added.filter((key) => !entitlementWords[key].available).map((key) => entitlementWords[key].words(plan.entitlements)),
      ...alsoComing[plan.key],
    ],
    signUpRole,
  };
}

export function planSummaries(): PlanSummary[] {
  const list = [
    summary(plans.free, null, 'For independent instructors', 'instructor'),
    summary(plans.pro, plans.free, 'For independent instructors who want more', 'instructor'),
    summary(plans.school, plans.pro, 'For driving schools', 'school'),
  ];
  // A plan carries everything the plan below it carries, so whatever is coming to that plan is
  // coming to this one too, oldest promise first. Without this, Messages appeared as coming on
  // Free alone while every Pro instructor had the menu row saying the same thing, and School never
  // heard about calendar sync at all (D-212).
  let inherited: string[] = [];
  return list.map((plan) => {
    const later = [...new Set([...inherited, ...plan.later])];
    inherited = later;
    return { ...plan, later };
  });
}
