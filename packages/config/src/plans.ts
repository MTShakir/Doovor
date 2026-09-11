/**
 * Plans and entitlements (PRD 9.18). Prices are integer pence and are launch defaults
 * to test, so they live here rather than in code paths. Subscription billing arrives
 * with ADM-10 in Phase 2 (D-022).
 */

export type PlanKey = 'free' | 'pro' | 'school';

export interface Entitlements {
  /** SMS reminders included each calendar month (NTF-01). */
  smsRemindersPerMonth: number;
  /** Auto-charge the saved card 24 hours before the lesson (PAY-03). */
  autoChargeBeforeLesson: boolean;
  gapFill: boolean;
  waitingListAutomation: boolean;
  expensesAndExports: boolean;
  calendarSync: boolean;
  customBookingColours: boolean;
  schoolPortal: boolean;
  reports: boolean;
  fleet: boolean;
}

export interface Plan {
  key: PlanKey;
  label: string;
  monthlyPricePence: number;
  yearlyPricePence: number | null;
  /** School plan is priced per instructor with a minimum number of instructors. */
  perInstructor: boolean;
  minimumInstructors: number;
  entitlements: Entitlements;
}

const freeEntitlements: Entitlements = {
  smsRemindersPerMonth: 0,
  autoChargeBeforeLesson: false,
  gapFill: false,
  waitingListAutomation: false,
  expensesAndExports: false,
  calendarSync: false,
  customBookingColours: false,
  schoolPortal: false,
  reports: false,
  fleet: false,
};

const proEntitlements: Entitlements = {
  ...freeEntitlements,
  smsRemindersPerMonth: 200,
  autoChargeBeforeLesson: true,
  gapFill: true,
  waitingListAutomation: true,
  expensesAndExports: true,
  calendarSync: true,
  customBookingColours: true,
};

export const plans: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    label: 'Free',
    monthlyPricePence: 0,
    yearlyPricePence: 0,
    perInstructor: false,
    minimumInstructors: 1,
    entitlements: freeEntitlements,
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    monthlyPricePence: 1200,
    yearlyPricePence: 12000,
    perInstructor: false,
    minimumInstructors: 1,
    entitlements: proEntitlements,
  },
  school: {
    key: 'school',
    label: 'School',
    monthlyPricePence: 900,
    yearlyPricePence: null,
    perInstructor: true,
    minimumInstructors: 2,
    entitlements: { ...proEntitlements, schoolPortal: true, reports: true, fleet: true },
  },
};

/**
 * Founding offer: the paid plan free for 12 months for the first 500 instructors and the
 * first 50 schools. Independents get Pro, schools get the School plan (D-027).
 */
export const foundingOffer = {
  months: 12,
  instructorLimit: 500,
  schoolLimit: 50,
} as const;

export type BusinessType = 'independent' | 'school';

export function foundingPlanFor(businessType: BusinessType): PlanKey {
  return businessType === 'school' ? 'school' : 'pro';
}

export function getEntitlements(plan: PlanKey): Entitlements {
  return plans[plan].entitlements;
}

export function hasEntitlement(
  plan: PlanKey,
  key: { [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never }[keyof Entitlements],
): boolean {
  return plans[plan].entitlements[key];
}

/** Monthly price in pence for a Business on a plan, applying the per-instructor minimum. */
export function monthlyPricePence(plan: PlanKey, instructorCount: number): number {
  const p = plans[plan];
  if (!p.perInstructor) return p.monthlyPricePence;
  return p.monthlyPricePence * Math.max(p.minimumInstructors, Math.max(0, Math.floor(instructorCount)));
}
