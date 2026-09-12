import { describe, expect, it } from 'vitest';
import {
  canOpenStep,
  nextStep,
  onboardingSteps,
  slugForStep,
  stepBySlug,
  stepByNumber,
  totalOnboardingSteps,
} from './steps';

describe('onboarding steps (AUTH-04, M1-02)', () => {
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

  it('allows going back but not skipping ahead of where they have reached', () => {
    expect(canOpenStep(1, 3)).toBe(true);
    expect(canOpenStep(3, 3)).toBe(true);
    expect(canOpenStep(4, 3)).toBe(false);
    expect(canOpenStep(0, 3)).toBe(false);
    expect(canOpenStep(6, 6)).toBe(false);
  });
});
