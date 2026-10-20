import { foundingProgress } from '@repo/core/founding';
import { describe, expect, it } from 'vitest';
import { foundingPrice, planSummaries } from './plan-features';

describe('what each plan says it includes (PRD 9.18, M5-09)', () => {
  it('prices every plan from the configuration', () => {
    expect(planSummaries().map(({ name, price, cadence }) => ({ name, price, cadence }))).toEqual([
      { name: 'Free', price: '£0', cadence: 'per month' },
      { name: 'Pro', price: '£12', cadence: 'per month, or £120 a year' },
      { name: 'School', price: '£15', cadence: 'per month plus £6 per instructor, or £150 a year plus £60 per instructor' },
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
    expect(free?.later).toEqual(['Messages: in-app chat with your learners']);
    expect(pro?.features).toEqual([
      'Everything in Free',
      'Unlimited learners',
      'Text message reminders, up to 200 a month',
      'Charge the saved card before each lesson',
      'Expenses, mileage and exports ready for Making Tax Digital',
      'Your own colours on your booking page',
      'A gallery of learners who passed, on your profile',
    ]);
    expect(pro?.later).toEqual([
      'Messages: in-app chat with your learners',
      'Gap Fill: cancelled lessons offered to your waiting list',
      'Waiting list automation',
      'Google and Outlook calendar sync',
      'AI Assistant',
    ]);
    expect(school?.features).toEqual(['Everything in Pro', 'School overview, instructors, learner allocation and school prices']);
    expect(school?.later).toEqual([
      'Messages: in-app chat with your learners',
      'Gap Fill: cancelled lessons offered to your waiting list',
      'Waiting list automation',
      'Google and Outlook calendar sync',
      'AI Assistant',
      'Reports by instructor',
      'Fleet: cars, MOT and insurance dates',
    ]);
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

  it('carries what is coming to a plan up to the plans above it (D-212)', () => {
    const [free, pro, school] = planSummaries();
    // Messages is coming to everybody, so nobody reads their own plan and concludes otherwise.
    for (const plan of [free, pro, school]) {
      expect(plan?.later).toContain('Messages: in-app chat with your learners');
    }
    // And School hears about the Pro thing it carries.
    expect(school?.later).toContain('Google and Outlook calendar sync');
  });

  it('sends instructors and schools to their own sign-up', () => {
    expect(planSummaries().map((plan) => plan.signUpRole)).toEqual(['instructor', 'instructor', 'school']);
  });
});

describe('a paid plan at its founding price (PRD 9.18, D-251)', () => {
  const [free, pro, school] = planSummaries();
  const places = (instructorsTaken: number, schoolsTaken: number) => ({
    months: 12,
    instructors: foundingProgress({ limit: 100, taken: instructorsTaken }),
    schools: foundingProgress({ limit: 50, taken: schoolsTaken }),
  });

  it('is nothing for a year, beside the price it is otherwise, and says what it costs after', () => {
    expect(pro && foundingPrice(pro, places(46, 3))).toEqual({
      usual: '£12',
      free: 'Free for 1 year',
      then: 'then £12 per month, or £120 a year',
      left: '54 of 100 places left',
    });
    expect(school && foundingPrice(school, places(46, 3))).toEqual({
      usual: '£15',
      free: 'Free for 1 year',
      then: 'then £15 per month plus £6 per instructor, or £150 a year plus £60 per instructor',
      left: '47 of 50 places left',
    });
  });

  it('counts each plan against its own places, so schools are not told the instructors have gone', () => {
    expect(pro && foundingPrice(pro, places(100, 3))).toBeNull();
    expect(school && foundingPrice(school, places(100, 3))).not.toBeNull();
    expect(school && foundingPrice(school, places(10, 50))).toBeNull();
  });

  it('shows no offer on Free, and none when the places cannot be counted', () => {
    expect(free && foundingPrice(free, places(0, 0))).toBeNull();
    expect(pro && foundingPrice(pro, null)).toBeNull();
  });
});
