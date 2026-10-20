import { plans, type Entitlements, type Plan, type PlanKey } from '@repo/config/plans';
import { foundingTermWords, type FoundingProgress } from '@repo/core/founding';
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
  gallery: { words: () => 'A gallery of learners who passed, on your profile', available: true },
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

/**
 * What a plan has today that is not an entitlement, because no plan below it could have it: the
 * school's own arrangements M9 built, said where the plans are compared (D-308).
 */
const alsoIncluded: Record<PlanKey, string[]> = {
  free: [],
  pro: [],
  school: [
    'Linked instructors who keep their own business, and their fees',
    'New pupils from your school’s page',
    'Weekly pay statements for your instructors',
  ],
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
  const yearly = formatPence(plan.yearlyPricePence ?? plan.monthlyPricePence * 12);
  // A school's price is its own fee, with each instructor on top of it (D-279).
  const cadence = plan.schoolFee
    ? `per month plus ${formatPence(plan.monthlyPricePence)} per instructor, or ${formatPence(plan.schoolFee.yearlyPricePence)} a year plus ${yearly} per instructor`
    : plan.perInstructor
      ? `per instructor per month${plan.minimumInstructors > 1 ? `, for at least ${String(plan.minimumInstructors)} instructors` : ''}`
      : plan.monthlyPricePence === 0
        ? 'per month'
        : `per month, or ${yearly} a year`;
  return {
    key: plan.key,
    name: plan.label,
    price: formatPence(plan.schoolFee?.monthlyPricePence ?? plan.monthlyPricePence),
    cadence,
    audience,
    features: [
      ...lead,
      ...added.filter((key) => entitlementWords[key].available).map((key) => entitlementWords[key].words(plan.entitlements)),
      ...alsoIncluded[plan.key],
    ],
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

export interface FoundingPrice {
  /** The plan's own price, shown struck through beside £0: "£12". */
  usual: string;
  /** "Free for 1 year" */
  free: string;
  /** What it costs after the founding term: "then £12 per month, or £120 a year". */
  then: string;
  /** "54 of 100 places left", from the database's own count. */
  left: string;
}

/**
 * A paid plan's price while its founding places last (PRD 9.18, D-251): nothing for the founding
 * term, beside the plan's own price struck through, and what it costs after. The struck price is
 * the one a founder pays when the term ends and everybody pays once the places have gone, so the
 * comparison is a true one, as a price shown against another has to be. Each plan is counted
 * against its own places, Pro the instructors' and School the schools'. When they have gone, or
 * cannot be counted, there is no offer to show and the card shows the plan's price as it is.
 */
export function foundingPrice(
  plan: PlanSummary,
  places: { months: number; instructors: FoundingProgress; schools: FoundingProgress } | null,
): FoundingPrice | null {
  if (places === null || plan.key === 'free') return null;
  const progress = plan.key === 'school' ? places.schools : places.instructors;
  if (progress.full) return null;
  return {
    usual: plan.price,
    free: `Free for ${foundingTermWords(places.months)}`,
    then: `then ${plan.price} ${plan.cadence}`,
    left: `${String(progress.left)} of ${String(progress.limit)} places left`,
  };
}
