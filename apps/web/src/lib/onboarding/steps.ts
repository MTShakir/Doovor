import type { BusinessType } from '@repo/db';

/**
 * The five onboarding screens (AUTH-04). Everything except the name can be skipped, and the
 * step someone is on is stored on their profile so a reload resumes where they left off. An
 * instructor who joins a school has four: the school sets the prices (AUTH-05, SCH-04, D-118).
 */
export const onboardingSteps = [
  { step: 1, slug: 'name', title: 'What should learners call you?', skippable: false },
  { step: 2, slug: 'badge', title: 'Your instructor badge', skippable: true },
  { step: 3, slug: 'area', title: 'Where do you teach?', skippable: true },
  { step: 4, slug: 'prices', title: 'Your prices', skippable: true },
  { step: 5, slug: 'hours', title: 'When do you work?', skippable: true },
] as const;

export type OnboardingSlug = (typeof onboardingSteps)[number]['slug'];
export type OnboardingStep = (typeof onboardingSteps)[number];

export const totalOnboardingSteps = onboardingSteps.length;

export function stepBySlug(slug: string): OnboardingStep | null {
  return onboardingSteps.find((entry) => entry.slug === slug) ?? null;
}

/** Steps are stored as numbers; anything outside the range starts at the beginning. */
export function stepByNumber(step: number): OnboardingStep {
  return onboardingSteps.find((entry) => entry.step === step) ?? onboardingSteps[0];
}

export function slugForStep(step: number): OnboardingSlug {
  return stepByNumber(step).slug;
}

/** The screens an instructor goes through: all five on their own, four at a school. */
export function stepsFor(businessType: BusinessType): readonly OnboardingStep[] {
  return businessType === 'school' ? onboardingSteps.filter((entry) => entry.slug !== 'prices') : onboardingSteps;
}

/** Whether a screen is one of theirs at all. */
export function isStepFor(step: OnboardingStep, businessType: BusinessType): boolean {
  return stepsFor(businessType).includes(step);
}

/** The step after this one, or null when this was the last. */
export function nextStep(step: number, businessType: BusinessType = 'independent'): OnboardingStep | null {
  return stepsFor(businessType).find((entry) => entry.step > step) ?? null;
}

/** Where a screen sits in their own list, for the progress bar: "Where do you work" is 4 of 4 at a school. */
export function stepPosition(step: OnboardingStep, businessType: BusinessType): { current: number; total: number } {
  const steps = stepsFor(businessType);
  return { current: steps.indexOf(step) + 1, total: steps.length };
}

/**
 * Someone can go back to a finished step, and forward only to the step they have reached.
 * Without this, a guessed address could skip the name.
 */
export function canOpenStep(requested: number, reached: number): boolean {
  return requested >= 1 && requested <= totalOnboardingSteps && requested <= Math.max(reached, 1);
}
