import { brand } from '@repo/config/brand';
import type { Guide } from '../types.ts';

/** Every rule and date here is from the GOV.UK pages in `sources`, read on 13 October 2026. */
export const drivingTestBookingRules2026: Guide = {
  slug: 'driving-test-booking-rules-2026',
  audience: 'learners',
  title: 'How to book, change or cancel your driving test under the 2026 rules',
  description:
    'Only you can book or manage your car driving test since 12 May 2026. The two change limit, the nearest centres rule, refunds and what your instructor can do.',
  summary:
    'DVSA changed the booking rules in spring 2026 to stop bots and resellers taking test slots. Here is what each change means for you, and how to make your booking count.',
  published: '2026-10-13',
  updated: '2026-10-13',
  body: `
    ## What changed, and when

    | From | What changed |
    |---|---|
    | 31 March 2026 | You can make 2 changes to a booking, down from 6 |
    | 12 May 2026 | Only you can book, change, swap or cancel your car driving test |
    | 9 June 2026 | You can only move your test to one of the 3 test centres nearest to where it is booked |

    ## Only you can book and manage your test

    It is against the law for anybody else to book, change or cancel your car driving test. That
    includes your driving instructor, a parent and any booking service. Somebody can still help you,
    as long as they are with you and you do as much of it as you can yourself.

    You book on GOV.UK with your provisional driving licence. The test costs £62 on a weekday and £75
    on an evening, a weekend or a bank holiday. That official fee is the only thing you should pay.

    ## You have 2 changes

    Each booking comes with 2 changes. These count as a change:

    - moving the date or the time
    - moving to another test centre
    - swapping with another learner

    Changing more than one thing at the same time still counts as one change. These do not count:

    - updating your address or contact details
    - adding or removing your instructor's reference number
    - a change DVSA makes, for example because of bad weather, which also gives you your 2 changes back

    If you need more than 2 changes, you have to cancel and book again. You get a full refund if you
    cancel at least 10 full working days before the test.

    ## Moving to another test centre

    You can move your test only to one of the 3 centres nearest to where it is booked, or back to
    the centre you first booked for that test. So book at a centre you mean to use.

    ## Swapping with another learner

    You can swap tests with another learner who already has one booked. A swap counts as one of your
    2 changes, and only you can arrange it.

    ## What your instructor can still do

    Your instructor cannot book or move your test, but they still play a part. They keep their
    availability up to date with DVSA, and you add their reference number to your booking, so the
    system checks they are free to bring you on the day. Tests an instructor booked for a pupil
    before 12 May 2026 still go ahead.

    ## Cancellation finder apps are not allowed

    Since 12 May 2026 you cannot use services that scan the booking system for earlier tests. DVSA
    watches the system, and can stop you booking online or cancel your test if the rules are broken.

    ## Before you book

    1. Ask your instructor whether you are ready, and choose a date you realistically expect to be ready for.
    2. Pick a test centre you will use, because moving it later is limited to the 3 nearest.
    3. Add your instructor's reference number, so the booking checks they are free.
    4. Keep your 2 changes for when something really changes.

    ## Find an instructor with space

    If you are still looking for an instructor, ${brand.name} shows instructors near you that we have
    checked, with their prices and free times. [See how it works for learners](/learners).
  `,
  questions: [
    {
      question: 'Can my driving instructor book my test for me?',
      answer:
        'No. Since 12 May 2026 only you can book, change, swap or cancel your car driving test. Your instructor keeps their availability up to date with DVSA, and you add their reference number to your booking.',
    },
    {
      question: 'What happens when I have used both changes?',
      answer:
        'You cannot change that booking again. Cancel it and book a new test; you get a full refund if you cancel at least 10 full working days before the test.',
    },
    {
      question: 'Does it use up a change if DVSA moves my test?',
      answer: 'No. A change DVSA makes, such as for bad weather, does not count, and you are given your 2 changes back.',
    },
    {
      question: 'Can a parent book my test?',
      answer: 'Not for you. They can help you book it yourself, as long as you are there and do as much of it as you can.',
    },
  ],
  sources: [
    { label: 'GOV.UK: Changes to driving test booking rules in 2026', url: 'https://www.gov.uk/guidance/changes-to-driving-test-booking-rules-in-2026' },
    { label: 'GOV.UK: Driving test cost', url: 'https://www.gov.uk/driving-test-cost' },
    { label: 'GOV.UK: Book your driving test', url: 'https://www.gov.uk/book-driving-test' },
  ],
  related: [],
};
