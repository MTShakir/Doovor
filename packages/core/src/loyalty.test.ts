import { describe, expect, it } from 'vitest';
import {
  loyaltyDiscount,
  loyaltyEveryMonths,
  loyaltyMonthsToMost,
  loyaltyMostPercent,
  loyaltyStepPercent,
  nextLoyaltyStep,
  priceAfterLoyalty,
} from './loyalty.ts';

describe('loyaltyDiscount (D-206)', () => {
  it('takes nothing off before the first three months are up', () => {
    expect(loyaltyDiscount(0)).toBe(0);
    expect(loyaltyDiscount(1)).toBe(0);
    expect(loyaltyDiscount(2)).toBe(0);
  });

  it('takes another step off every three months', () => {
    expect(loyaltyDiscount(3)).toBe(5);
    expect(loyaltyDiscount(5)).toBe(5);
    expect(loyaltyDiscount(6)).toBe(10);
    expect(loyaltyDiscount(12)).toBe(20);
  });

  it('stops at the most, however long somebody stays', () => {
    expect(loyaltyDiscount(loyaltyMonthsToMost)).toBe(loyaltyMostPercent);
    expect(loyaltyDiscount(loyaltyMonthsToMost + 3)).toBe(loyaltyMostPercent);
    expect(loyaltyDiscount(600)).toBe(loyaltyMostPercent);
  });

  it('reaches the most after eighteen months', () => {
    expect(loyaltyMonthsToMost).toBe(18);
    expect(loyaltyDiscount(17)).toBe(25);
  });

  it('treats a run that has been broken as no run at all, because the caller counts it that way', () => {
    expect(loyaltyDiscount(0)).toBe(0);
  });

  it('is not fooled by nonsense', () => {
    expect(loyaltyDiscount(-4)).toBe(0);
    expect(loyaltyDiscount(Number.NaN)).toBe(0);
    expect(loyaltyDiscount(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('nextLoyaltyStep (D-206)', () => {
  it('says what is next and how long away it is', () => {
    expect(nextLoyaltyStep(0)).toEqual({ percent: 5, monthsAway: 3 });
    expect(nextLoyaltyStep(1)).toEqual({ percent: 5, monthsAway: 2 });
    expect(nextLoyaltyStep(3)).toEqual({ percent: 10, monthsAway: 3 });
    expect(nextLoyaltyStep(4)).toEqual({ percent: 10, monthsAway: 2 });
  });

  it('says nothing once it is as low as it goes', () => {
    expect(nextLoyaltyStep(loyaltyMonthsToMost)).toBeNull();
    expect(nextLoyaltyStep(loyaltyMonthsToMost + 1)).toBeNull();
  });

  it('counts part of a month as not yet that month', () => {
    expect(nextLoyaltyStep(2.9)).toEqual({ percent: 5, monthsAway: 1 });
  });
});

describe('priceAfterLoyalty (D-206)', () => {
  it('leaves the price alone before the first step', () => {
    expect(priceAfterLoyalty(1200, 2)).toBe(1200);
  });

  it('takes the discount off in whole pence', () => {
    expect(priceAfterLoyalty(1200, 3)).toBe(1140);
    expect(priceAfterLoyalty(1200, 18)).toBe(840);
    // 5% of 999 is 49.95p, which is a penny either way and must not be a fraction of one.
    expect(priceAfterLoyalty(999, 3)).toBe(949);
  });

  it('keeps the steps and the cap where the promise puts them', () => {
    expect(loyaltyEveryMonths).toBe(3);
    expect(loyaltyStepPercent).toBe(5);
    expect(loyaltyMostPercent).toBe(30);
  });
});
