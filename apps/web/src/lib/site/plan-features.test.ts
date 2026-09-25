import { describe, expect, it } from 'vitest';
import { planSummaries } from './plan-features';

describe('what each plan says it includes (PRD 9.18, M5-09)', () => {
  it('prices every plan from the configuration', () => {
    expect(planSummaries().map(({ name, price, cadence }) => ({ name, price, cadence }))).toEqual([
      { name: 'Free', price: '£0', cadence: 'per month' },
      { name: 'Pro', price: '£12', cadence: 'per month, or £120 a year' },
      { name: 'School', price: '£9', cadence: 'per instructor per month, for at least 2 instructors' },
    ]);
  });

  it('lists what is there today, and keeps what arrives later apart from it', () => {
    const [free, pro, school] = planSummaries();
    expect(free?.features).toEqual([
      'Diary and bookings',
      'Lesson records and progress',
      'Card, cash and bank transfer payments',
      'Public profile and booking link',
      'Email and push reminders',
      'Up to 10 learners at once',
    ]);
    expect(free?.later).toEqual(['In-app chat with your learners']);
    expect(pro?.features).toEqual([
      'Everything in Free',
      'Unlimited learners',
      'Text message reminders, up to 200 a month',
      'Charge the saved card before each lesson',
      'Expenses, mileage and exports ready for Making Tax Digital',
    ]);
    expect(pro?.later).toEqual([
      'Gap Fill: cancelled lessons offered to your waiting list',
      'Waiting list automation',
      'Google and Outlook calendar sync',
      'Your own colours on your booking page',
      'AI Assistant',
    ]);
    expect(school?.features).toEqual(['Everything in Pro', 'School overview, instructors, learner allocation and school prices']);
    expect(school?.later).toEqual(['Reports by instructor', 'Fleet: cars, MOT and insurance dates']);
  });

  it('turns a limit into what the plan above it gives, rather than dropping it (D-208)', () => {
    const [free, pro] = planSummaries();
    expect(free?.features).toContain('Up to 10 learners at once');
    expect(pro?.features).toContain('Unlimited learners');
  });

  it('never sells something that is not built (D-116)', () => {
    for (const plan of planSummaries()) {
      for (const later of plan.later) {
        expect(plan.features).not.toContain(later);
      }
    }
  });

  it('sends instructors and schools to their own sign-up', () => {
    expect(planSummaries().map((plan) => plan.signUpRole)).toEqual(['instructor', 'instructor', 'school']);
  });
});
