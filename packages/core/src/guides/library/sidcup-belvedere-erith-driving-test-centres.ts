import { brand } from '@repo/config/brand';
import type { Guide } from '../types.ts';
import { comparedOn, comparisonSlug, ours } from './apps-compared.ts';

/**
 * The guide for instructors who teach around the London Borough of Bexley, where the app is built
 * (D-387). Pass rates are DVSA's for car tests from April 2025 to March 2026, read for each centre
 * on Veygo's pages on 26 October 2026. Where each centre and place is comes from postcodes.io and
 * OpenStreetMap; the nearest centre to each place is measured in a straight line between them.
 */
export const sidcupBelvedereErithDrivingTestCentres: Guide = {
  slug: 'sidcup-belvedere-erith-driving-test-centres',
  audience: 'instructors',
  title: 'Sidcup, Belvedere and Erith test centres: a 2026 guide for Bexley driving instructors',
  description:
    'Pass rates, addresses and nearby roads for the Sidcup, Belvedere and Erith driving test centres, and how Bexley instructors fill a week of lessons.',
  summary:
    'The London Borough of Bexley has three driving test centres within about 6 miles of each other, and their pass rates are 18 points apart. Here is what that means for your learners, and how to run a full week of lessons from Sidcup to Belvedere.',
  takeaways: [
    "In DVSA's figures for the year to March 2026, 58.7% of car tests were passed at Sidcup, 51.6% at Erith and 40.5% at Belvedere.",
    "DVSA's Erith centre is in Lower Belvedere, under 2 miles from the Belvedere centre, and both have DA17 postcodes, so check the centre's name on a learner's booking.",
    'From Bexleyheath, Welling, Crayford, Abbey Wood and Thamesmead, the nearest of the three in a straight line is Belvedere, the one with the lowest pass rate.',
    'Since 9 June 2026 a test can only be moved to one of the 3 centres nearest to where it was booked, so agree the centre with your learner before they book.',
    `${brand.name} is built in Belvedere: learners across the borough book your free times from your link and pay before the lesson.`,
  ],
  keywords: [
    'Bexley driving instructors',
    'Sidcup driving test centre',
    'Belvedere driving test centre',
    'Erith driving test centre',
    'Sidcup test centre pass rate',
    'Belvedere test centre pass rate',
    'driving instructor in Sidcup',
    'driving instructor software',
  ],
  places: [
    { name: 'London Borough of Bexley', region: 'GB-BEX', point: { latitude: 51.45, longitude: 0.15 } },
    { name: 'Sidcup', region: 'GB-BEX', point: { latitude: 51.4356, longitude: 0.102 } },
    { name: 'Bexley', region: 'GB-BEX', point: { latitude: 51.4417, longitude: 0.1505 } },
    { name: 'Belvedere', region: 'GB-BEX', point: { latitude: 51.4865, longitude: 0.1488 } },
    { name: 'Bexleyheath', region: 'GB-BEX', point: { latitude: 51.4633, longitude: 0.14 } },
    { name: 'Welling', region: 'GB-BEX', point: { latitude: 51.4623, longitude: 0.1073 } },
    { name: 'Erith', region: 'GB-BEX', point: { latitude: 51.4808, longitude: 0.1792 } },
    { name: 'Crayford', region: 'GB-BEX', point: { latitude: 51.4528, longitude: 0.177 } },
    { name: 'Thamesmead', region: 'GB-GRE', point: { latitude: 51.5044, longitude: 0.1188 } },
    { name: 'Abbey Wood', region: 'GB-GRE', point: { latitude: 51.4908, longitude: 0.108 } },
    { name: 'Dartford', region: 'GB-KEN', point: { latitude: 51.4481, longitude: 0.2095 } },
  ],
  published: comparedOn,
  updated: comparedOn,
  body: `
    ## Three test centres, 18 points apart

    DVSA runs three car test centres in the London Borough of Bexley, all within about 6 miles of
    each other. Between them they took 24,372 car tests in the year to March 2026, and how many
    passed was very different from one to the next:

    | Test centre | Passed | Tests | First attempts passed |
    |---|---|---|---|
    | Sidcup (London) | 58.7% | 14,318 | 59.5% |
    | Erith (London) | 51.6% | 5,809 | 49.8% |
    | Belvedere (London) | 40.5% | 4,245 | 39.1% |

    The figures are DVSA's, for car tests from April 2025 to March 2026. At all three, manual tests
    were passed more often than automatic ones:

    | Test centre | Manual | Automatic |
    |---|---|---|
    | Sidcup (London) | 60.6% | 56.7% |
    | Erith (London) | 53.0% | 50.4% |
    | Belvedere (London) | 42.7% | 38.3% |

    ### Where each centre is

    | Test centre | Address |
    |---|---|
    | Sidcup (London) | 2 Crayside, Five Arches Business Estate, Maidstone Road, Sidcup DA14 5AG |
    | Erith (London) | Crabtree Manorway North, Belvedere DA17 6LJ |
    | Belvedere (London) | 33 Woolwich Road, Belvedere DA17 5EE |

    ### Erith and Belvedere are two centres, both in Belvedere

    DVSA's Erith driving test centre is not in Erith town. It is on an industrial estate in Lower
    Belvedere, at Crabtree Manorway North, under 2 miles from the Belvedere centre on Woolwich Road
    in Upper Belvedere. Both postcodes start DA17. When a learner tells you they are booked "at Belvedere",
    check the centre's name on the booking before you plan their last lessons.

    ## What the pass rates mean for your learners

    A lower pass rate does not make a centre unfair, and DVSA does not say why centres differ. The
    figure moves with how ready learners are when they take the test, how many are on a second or
    later attempt, and the roads the examiners use. What the numbers do tell you is that a learner
    booked at Belvedere needs to be ready for Belvedere's roads, not Sidcup's.

    Since 9 June 2026 a test can only be moved to one of the 3 centres nearest to where it was
    booked, and each booking has 2 changes. Agree the centre with your learner before they book,
    and teach on its roads at the time of day of the test. Since 12 May 2026 only the learner can
    book, so they need the centre and your reference number before they start. Our guide to
    [the 2026 driving test booking rules](/guides/driving-test-booking-rules-2026) has the detail.

    ## The roads around each centre

    DVSA no longer publishes test routes, and examiners choose them on the day, so teach the area
    rather than a route.

    - **Sidcup (London)** is on Maidstone Road at Foots Cray, close to the Sidcup Bypass, a 50 mph dual carriageway, so learners booked here should be confident joining and leaving a fast road as well as on Sidcup's residential streets.
    - **Belvedere (London)** is on Woolwich Road, a 30 mph road among the residential streets of Upper Belvedere. The streets around it climb the hill above the river, and Picardy Road has a sign for a 10% gradient, so hill starts are worth the practice.
    - **Erith (London)** is on Crabtree Manorway North, on the riverside industrial estate in Lower Belvedere, near Bronze Age Way, a dual carriageway with 50 mph and 30 mph stretches. Expect lorries and vans on the estate roads.

    ## Where your learners live, and their nearest centre

    The borough runs from Thamesmead and Abbey Wood on the Greenwich side to Crayford, with Dartford
    in Kent beyond it. Measured in a straight line from each place to the three centres, this is
    the nearest:

    | Place | Postcodes | Nearest of the three |
    |---|---|---|
    | Sidcup | DA14, DA15 | Sidcup |
    | Bexley village | DA5 | Sidcup |
    | Bexleyheath | DA6, DA7 | Belvedere |
    | Welling | DA16 | Belvedere |
    | Belvedere | DA17 | Belvedere |
    | Erith | DA8 | Belvedere, with Erith's centre about as close |
    | Crayford | DA1 | Belvedere |
    | Abbey Wood | SE2 | Belvedere |
    | Thamesmead | SE28 | Belvedere |

    The nearest centre is not always the right one. A learner in Bexleyheath may be better taught
    for Sidcup's roads if that is where their test is booked, and their lessons should follow the
    booking, not the map.

    ## Filling a week of lessons across the borough

    - **Group lessons by area.** Teach Belvedere, Erith and Abbey Wood in one part of the day, and Sidcup, Bexley and Welling in another, so you are not crossing the borough at school run time.
    - **Leave a gap for the drive.** The Sidcup and Belvedere centres are about 4.5 miles apart in a straight line, and longer by road, so set a gap between lessons that covers your longest run.
    - **Collect learners where they are.** Home, college and work all make sense as pickup points, as long as each lesson says which.
    - **Teach to the booking.** Once a learner has a test date, give their last few lessons to the roads around that centre.
    - **Put your link where local learners look**: your car, your messages and the local social media groups they use.

    ![An instructor's Today screen with the day's lessons, pickup places and which lessons are paid](today "An instructor's day in the app: who is next, where to collect them, and whether each lesson is paid.")

    ## Software that suits teaching in Bexley

    Whether you are a driving instructor in Sidcup or teach across the whole borough, the app on
    your phone does most of the office work. ${brand.name} is driving instructor software built in
    Belvedere. Learners anywhere in the borough book your free times from your own link and pay by
    card, Apple Pay or Google Pay before the lesson, and the money goes to your own account. You set the gap between lessons and
    the least notice you need, learners save their pickup places, weekly lessons book themselves,
    and reminders go the day before and two hours before.

    Your profile shows learners a blue tick once we have checked your ADI badge, with your car,
    your prices and your next free times.

    ![An instructor's public profile with a checked badge, car, price and next free times](public-profile "An example profile. The blue tick shows we have checked the instructor's badge, and learners book a free time from it.")

    Free carries up to ${ours.freeLearners} learners, and Pro is ${ours.proMonthly} a month.
    [See how ${brand.name} works for driving instructors](/instructors-software), or read
    [how to choose driving instructor software](/guides/how-to-choose-driving-instructor-software).
  `,
  questions: [
    {
      question: 'Which driving test centre near Bexley has the best pass rate?',
      answer:
        "Sidcup. In DVSA's figures for the year to March 2026, 58.7% of car tests there were passed, against 51.6% at Erith and 40.5% at Belvedere.",
    },
    {
      question: 'What is the Sidcup test centre pass rate?',
      answer: "58.7% for car tests in the year to March 2026, in DVSA's figures, with 59.5% of first attempts passed: the highest of the borough's three centres.",
    },
    {
      question: 'What is the Belvedere test centre pass rate?',
      answer: "40.5% for car tests in the year to March 2026, in DVSA's figures, with 39.1% of first attempts passed: the lowest of the borough's three centres.",
    },
    {
      question: 'Where is Sidcup driving test centre?',
      answer: 'At 2 Crayside, Five Arches Business Estate, Maidstone Road, Sidcup DA14 5AG, at Foots Cray close to the Sidcup Bypass.',
    },
    {
      question: 'Where is Belvedere driving test centre?',
      answer: 'At 33 Woolwich Road, Belvedere DA17 5EE, in Upper Belvedere.',
    },
    {
      question: 'Are the Erith and Belvedere test centres the same?',
      answer:
        "No. They are two centres under 2 miles apart, both in Belvedere: Erith (London) at Crabtree Manorway North, DA17 6LJ, and Belvedere (London) at 33 Woolwich Road, DA17 5EE. Check the centre's name on the booking.",
    },
    {
      question: "Can a driving instructor book a learner's test at Sidcup?",
      answer:
        "No. Since 12 May 2026 only the learner can book, change, swap or cancel their car driving test. The instructor keeps their availability up to date with DVSA, and the learner adds the instructor's reference number to the booking.",
    },
  ],
  sources: [
    { label: 'GOV.UK: Car driving test data by test centre', url: 'https://www.gov.uk/government/statistical-data-sets/car-driving-test-data-by-test-centre' },
    { label: 'GOV.UK: Changes to driving test booking rules in 2026', url: 'https://www.gov.uk/guidance/changes-to-driving-test-booking-rules-in-2026' },
    { label: 'Veygo: Sidcup (London) driving test centre', url: 'https://www.veygo.com/driving-test-centres/sidcup-london/' },
    { label: 'Veygo: Erith (London) driving test centre', url: 'https://www.veygo.com/driving-test-centres/erith-london/' },
    { label: 'Veygo: Belvedere (London) driving test centre', url: 'https://www.veygo.com/driving-test-centres/belvedere-london/' },
    {
      label: 'Wikimedia Commons: the 10% steep hill sign on Picardy Road, Belvedere',
      url: 'https://commons.wikimedia.org/wiki/File:Picardy_Road_-_Steep_Hill_10%5E_-_geograph.org.uk_-_1435397.jpg',
    },
  ],
  related: ['driving-test-booking-rules-2026', 'how-to-choose-driving-instructor-software', comparisonSlug],
};
