import { brand } from '@repo/config/brand';
import { amapRates } from '../../mileage.ts';
import type { Guide } from '../types.ts';

const thisYear = amapRates(2026);
const lastYear = amapRates(2025);

/**
 * What a self-employed instructor can claim, from the GOV.UK pages in `sources`, read on 13
 * October 2026. The mileage rates are the app's own, so the guide and the books cannot disagree.
 */
export const drivingInstructorExpenses: Guide = {
  slug: 'driving-instructor-expenses',
  audience: 'instructors',
  title: 'Driving instructor expenses: what you can claim, and the rule about dual controls',
  description:
    'The costs a self-employed driving instructor can claim against tax, why a dual control car cannot use the mileage rate, and keeping records HMRC accepts.',
  summary:
    'Every cost you claim lowers the tax on what you earn from lessons. Here is what counts, with the one rule about your car that is easy to miss.',
  published: '2026-10-13',
  updated: '2026-10-13',
  body: `
    ## The rule behind every claim

    You can claim a cost when it is for your business. When something is used for your business and
    your own life, such as your phone, or a car you also drive at weekends, you can claim only the
    business part. If you use the £1,000 trading allowance instead, you cannot claim any expenses,
    which suits very few full-time instructors.

    ## Your car: actual costs, not the mileage rate

    Most self-employed drivers can choose between a flat rate for each business mile and what their
    vehicle actually costs. GOV.UK names **dual control driving instructors' cars** among the cars
    that cannot use the flat rates. If you teach in a car with dual controls, claim its actual costs
    instead:

    - fuel
    - insurance, including your instructor cover
    - repairs and servicing
    - vehicle tax
    - breakdown cover
    - parking
    - lease or hire charges

    If you also use the car for weekends and holidays, claim only the business share, and keep a log
    of your business miles to show how you worked it out. The cost of buying the car is claimed
    through capital allowances, not as an expense.

    ### If you teach in a car without dual controls

    A car without dual controls can use the flat rate. For the 2026 to 2027 tax year that is
    ${String(thisYear.firstPence)}p a mile for the first 10,000 business miles and
    ${String(thisYear.afterPence)}p after that; for miles before 6 April 2026 it was
    ${String(lastYear.firstPence)}p. Once you use the flat rate for a car, you must keep using it
    for as long as the car is in your business, and you cannot use it for a car you have already
    claimed capital allowances or running costs for.

    ## Other costs you can usually claim

    - **The ADI register**: the fee to stay registered as an approved driving instructor, £300 every 4 years.
    - **A franchise fee**, if you teach under a driving school's name.
    - **Your phone and data**: the business share.
    - **Advertising**: your website, listings and printed cards.
    - **Training that keeps your skills current**, such as refresher courses.
    - **Financial costs**: business insurance, bank charges, card payment fees and your accountant.
    - **Subscriptions** to trade or professional journals.
    - **A uniform**, if you wear one, but not everyday clothes.

    ## What you cannot claim

    - Driving that is not for your business.
    - Fines and penalty charges, such as a parking or speeding fine.
    - Travel between home and work. How this applies when you set off from home to collect a pupil depends on how your business is run, so check with an accountant.
    - Qualifying as an instructor in the first place, which GOV.UK counts as training to start a new business.

    ## Keep records that stand up

    Record every cost as it happens, with a photo of the receipt, and keep a log of your business
    miles even when you claim actual costs, so the business share is easy to show. Once
    [Making Tax Digital](/guides/making-tax-digital-for-driving-instructors) applies to you, digital
    records are required anyway.

    ## Where ${brand.name} fits

    ${brand.name} records every lesson payment as it happens, and on Pro keeps your expenses with a
    photo of each receipt and exports your income and expenses by tax year and by quarter for your
    accountant. [See how it works for instructors](/instructors-software).

    > This guide is general information, not tax advice. HMRC or an accountant can tell you how the
    > rules apply to you.
  `,
  questions: [
    {
      question: 'Can I claim the mileage rate for my dual control car?',
      answer:
        "No. GOV.UK lists dual control driving instructors' cars among the cars that cannot use the flat rates. Claim the car's actual running costs instead, the business share if you also use it privately, and capital allowances on buying it.",
    },
    {
      question: 'Can I claim my ADI registration fee?',
      answer: 'Yes. The £300 fee to stay on the register every 4 years is a cost of your business. Keep the receipt.',
    },
    {
      question: 'Can I claim the cost of training to become an instructor?',
      answer:
        'Not the training that qualified you, which counts as starting a new business. Refresher courses and training that keeps your skills up to date can be claimed.',
    },
    {
      question: 'What if I also use my car for family trips?',
      answer: 'Claim only the business share of its costs. A log of your business miles shows how you worked out that share.',
    },
  ],
  sources: [
    { label: "GOV.UK: Expenses if you're self-employed", url: 'https://www.gov.uk/expenses-if-youre-self-employed' },
    { label: 'GOV.UK: Car, van and travel expenses', url: 'https://www.gov.uk/expenses-if-youre-self-employed/travel' },
    { label: 'GOV.UK: Simplified expenses for vehicles', url: 'https://www.gov.uk/simpler-income-tax-simplified-expenses/vehicles' },
    { label: 'GOV.UK: Training courses', url: 'https://www.gov.uk/expenses-if-youre-self-employed/training-courses' },
    { label: 'GOV.UK: Approved driving instructor (ADI) fees', url: 'https://www.gov.uk/approved-driving-instructor-adi-fees' },
  ],
  related: ['making-tax-digital-for-driving-instructors'],
};
