import { describe, expect, it } from 'vitest';
import {
  afterStep,
  canOpenStep,
  isStepFor,
  nextStep,
  onboardingSteps,
  previousStep,
  slugForStep,
  stepBySlug,
  stepByNumber,
  stepNumber,
  stepPosition,
  stepTitle,
  totalOnboardingSteps,
} from './steps';

describe('onboarding steps (AUTH-04, M1-02)', () => {
  it('asks somebody joining a school their name, as the business is the school (D-196)', () => {
    const name = stepByNumber(1);
    expect(stepTitle(name, 'independent')).toBe('Your name and your business');
    expect(stepTitle(name, 'school')).toBe('Your name');
    expect(stepTitle(stepByNumber(2), 'school')).toBe('Your instructor badge');
  });

  it('has the five screens from the requirements, and only the name is required', () => {
    expect(totalOnboardingSteps).toBe(5);
    expect(onboardingSteps.map((entry) => entry.slug)).toEqual(['name', 'badge', 'area', 'prices', 'hours']);
    expect(onboardingSteps.filter((entry) => !entry.skippable).map((entry) => entry.slug)).toEqual(['name']);
  });

  it('maps between addresses and stored steps', () => {
    expect(stepBySlug('area')?.step).toBe(3);
    expect(stepBySlug('nonsense')).toBeNull();
    expect(slugForStep(5)).toBe('hours');
    expect(stepByNumber(99).slug).toBe('name');
  });

  it('knows where to go next, and when there is nowhere left', () => {
    expect(nextStep(1)?.slug).toBe('badge');
    expect(nextStep(5)).toBeNull();
  });

  it('gives an instructor at a school four screens, because the school sets the prices (AUTH-05)', () => {
    const prices = stepBySlug('prices');
    const hours = stepBySlug('hours');
    if (!prices || !hours) throw new Error('missing steps');
    expect(isStepFor(prices, 'school')).toBe(false);
    expect(isStepFor(prices, 'independent')).toBe(true);
    expect(nextStep(3, 'school')?.slug).toBe('hours');
    expect(nextStep(3)?.slug).toBe('prices');
    expect(nextStep(5, 'school')).toBeNull();
    expect(stepPosition(hours, 'school')).toEqual({ current: 4, total: 4 });
    expect(stepPosition(hours, 'independent')).toEqual({ current: 5, total: 5 });
  });

  it('allows going back but not skipping ahead of where they have reached', () => {
    expect(canOpenStep(1, 3)).toBe(true);
    expect(canOpenStep(3, 3)).toBe(true);
    expect(canOpenStep(4, 3)).toBe(false);
    expect(canOpenStep(0, 3)).toBe(false);
    expect(canOpenStep(6, 6)).toBe(false);
  });

  it('carries on from the screen they are on, not from the furthest one reached (D-263)', () => {
    // The product owner's case: back from 3 to 2, then Continue, went to 4.
    expect(afterStep(2, 3, 'independent')).toEqual({ next: stepBySlug('area'), reached: 3 });
    // And what was reached stays reached, so the screens already done stay open.
    expect(afterStep(2, 5, 'independent')?.reached).toBe(5);
    // Going forward for the first time moves what was reached along with it.
    expect(afterStep(3, 3, 'independent')).toEqual({ next: stepBySlug('prices'), reached: 4 });
    // At a school the prices are the school's, so the area leads to the hours.
    expect(afterStep(3, 3, 'school')).toEqual({ next: stepBySlug('hours'), reached: 5 });
    // The last screen finishes.
    expect(afterStep(5, 5, 'independent')).toBeNull();
  });

  it('goes back to the screen before, which is never the prices at a school (D-263)', () => {
    expect(previousStep(1, 'independent')).toBeNull();
    expect(previousStep(2, 'independent')?.slug).toBe('name');
    expect(previousStep(5, 'independent')?.slug).toBe('prices');
    expect(previousStep(5, 'school')?.slug).toBe('area');
  });

  it('numbers each screen by its address', () => {
    expect(onboardingSteps.map((entry) => stepNumber(entry.slug))).toEqual([1, 2, 3, 4, 5]);
  });
});
