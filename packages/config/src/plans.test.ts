import { describe, expect, it } from 'vitest';
import { foundingPlanFor, getEntitlements, hasEntitlement, monthlyPricePence, plans } from './plans.ts';

describe('plans', () => {
  it('stores every price as integer pence', () => {
    for (const plan of Object.values(plans)) {
      expect(Number.isInteger(plan.monthlyPricePence)).toBe(true);
      if (plan.yearlyPricePence !== null) expect(Number.isInteger(plan.yearlyPricePence)).toBe(true);
    }
  });

  it('matches the PRD 9.18 launch defaults', () => {
    expect(plans.free.monthlyPricePence).toBe(0);
    expect(plans.pro.monthlyPricePence).toBe(1200);
    expect(plans.pro.yearlyPricePence).toBe(12000);
    expect(plans.school.monthlyPricePence).toBe(900);
    expect(plans.school.minimumInstructors).toBe(2);
  });

  it('gives Pro 200 SMS reminders a month and Free none', () => {
    expect(getEntitlements('pro').smsRemindersPerMonth).toBe(200);
    expect(getEntitlements('free').smsRemindersPerMonth).toBe(0);
  });

  it('gates auto-charge and the school portal by plan', () => {
    expect(hasEntitlement('free', 'autoChargeBeforeLesson')).toBe(false);
    expect(hasEntitlement('pro', 'autoChargeBeforeLesson')).toBe(true);
    expect(hasEntitlement('pro', 'schoolPortal')).toBe(false);
    expect(hasEntitlement('school', 'schoolPortal')).toBe(true);
    expect(hasEntitlement('school', 'gapFill')).toBe(true);
  });

  it('applies the school minimum of 2 instructors', () => {
    expect(monthlyPricePence('school', 0)).toBe(1800);
    expect(monthlyPricePence('school', 1)).toBe(1800);
    expect(monthlyPricePence('school', 6)).toBe(5400);
    expect(monthlyPricePence('pro', 6)).toBe(1200);
  });

  it('maps the founding offer to the paid plan for each business type', () => {
    expect(foundingPlanFor('independent')).toBe('pro');
    expect(foundingPlanFor('school')).toBe('school');
  });
});
