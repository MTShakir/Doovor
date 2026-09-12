/**
 * The five onboarding screens (AUTH-04). Everything except the name can be skipped, and the
 * step someone is on is stored on their profile so a reload resumes where they left off.
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

/** The step after this one, or null when this was the last. */
export function nextStep(step: number): OnboardingStep | null {
  return onboardingSteps.find((entry) => entry.step === step + 1) ?? null;
}

/**
 * Someone can go back to a finished step, and forward only to the step they have reached.
 * Without this, a guessed address could skip the name.
 */
export function canOpenStep(requested: number, reached: number): boolean {
  return requested >= 1 && requested <= totalOnboardingSteps && requested <= Math.max(reached, 1);
}
