import { brand } from '@repo/config/brand';
import { formatPence } from '../../money.ts';
import type { Guide } from '../types.ts';
import {
  cardFeePence,
  comparedOn,
  comparedOnWords,
  comparisonSlug,
  myDriveTime,
  ours,
  pencePerLesson,
  stripePricingUrl,
  totalDrive,
} from './apps-compared.ts';

const [basic, ultimate, tdPro, elite] = totalDrive.plans;
const cheapest = formatPence(basic.pence);
const dearest = formatPence(elite.pence);
const lesson = 3800;

/**
 * The guide to choosing driving instructor software (D-387): what it does, what it costs, and what
 * to ask. The instructor figures are DVSA's own survey; other companies' prices are from their own
 * pages, read on the day in `apps-compared.ts`, and ours from the plans the app charges.
 */
export const howToChooseDrivingInstructorSoftware: Guide = {
  slug: 'how-to-choose-driving-instructor-software',
  audience: 'instructors',
  title: 'Driving instructor software: how to choose the best app in 2026',
  description:
    'What driving instructor software does, what UK instructors pay for it in 2026, and how to choose an app for bookings, payments and lesson records.',
  summary:
    'Most driving instructors now run their week from an app on their phone. Here is what good driving instructor software does, what it costs, and the questions to ask before you move your learners onto one.',
  takeaways: [
    'Driving instructor software keeps your diary, lets learners book and pay, reminds them before each lesson, records how each lesson went and keeps your takings ready for tax, on your phone.',
    `Among the apps compared here, one instructor pays from £0 to ${dearest} a month, as each company's own pricing page showed on ${comparedOnWords}.`,
    'The prices differ most on online booking and card payments, so check which plan includes them, not only the cheapest plan.',
    `${brand.name} includes online booking and card payments on every plan: Free carries up to ${ours.freeLearners} learners, and Pro is ${ours.proMonthly} a month.`,
  ],
  keywords: [
    'driving instructor software',
    'best driving instructor app in the UK',
    'driving instructor app',
    'free driving instructor app',
    'driving lesson booking system',
    'driving instructor diary app',
    'ADI software',
    'driving school software',
  ],
  places: [{ name: 'United Kingdom', region: 'GB' }],
  published: comparedOn,
  updated: comparedOn,
  body: `
    ## What driving instructor software does

    At the end of September 2025 there were 43,334 approved driving instructors in Great Britain.
    DVSA's survey of them found 68.2% teach independently, and most of the rest teach under a
    driving school's name. For most, the business is one person and a car, so the app on their
    phone ends up doing the office work.

    Driving instructor software, also called a driving instructor app or ADI software, does seven
    jobs:

    - **A diary** of your lessons, your working hours and the time you keep free.
    - **Bookings**: learners book your free times themselves, from a link you share.
    - **Payments**: learners pay by card, Apple Pay or Google Pay, and you record cash and bank transfers too.
    - **Reminders** before each lesson, so fewer learners forget to turn up.
    - **Lesson records**: what you covered and how it went, which your learner can see.
    - **A learner app**, free for your learners, with their lessons, payments and progress.
    - **The books**: what you took and what you spent, ready for your tax return.

    ![A learner choosing a driving lesson time on an instructor's booking page](booking-page "An example booking page: the learner picks a lesson, a day and a free time, and sees the cancellation policy before booking.")

    ## The features that matter most

    ### Learners book your free times themselves

    Online booking is the heart of any driving lesson booking system, and the feature that gives
    you your evenings back. Instead of a run of texts to find a time, a learner opens your link,
    sees only the times you are free and books one. Look for an app that keeps a gap between
    lessons for the drive to the next pickup, stops anybody booking at too short notice, and lets
    you choose whether bookings are confirmed straight away or come to you as requests.

    ### Payment before the lesson

    The next biggest change is being paid before you drive off. With card payments, a learner pays
    as they book, or the app charges a card they saved before each lesson, so nobody leaves the car
    promising to pay next week. Ask two questions: whose account the money goes into, and what
    each payment costs. Card fees are a percentage plus a few pence. Stripe's standard fee for a UK
    card is ${ours.cardFee}, which is ${String(cardFeePence(lesson))}p on a ${formatPence(lesson)} lesson.

    ![A learner paying for a driving lesson by card in the learner app](learner-pay "Paying for a lesson in the learner's app. The card details go to the payment provider, and the instructor is told as soon as the payment goes through.")

    ### Reminders and a cancellation policy

    A reminder the day before and another two hours before catches most forgotten lessons. Texts
    reach everybody but cost money; email and app notifications cost nothing. Your app should also
    hold your cancellation policy, such as free cancellation up to 48 hours before, with what a
    late cancellation costs, so learners see it before they book rather than when they cancel.

    ### Lesson records your learner can see

    Recording a lesson takes under a minute when the app gives you the skills to tap. The best use
    the areas a driving examiner marks on the test report, so progress is measured against what the
    test asks for. When learners can see their own records, they turn up knowing what to practise.

    ![Recording a driving lesson by tapping the skills covered](lesson-record "Recording a lesson: tap the skills you covered, then rate each one. The list follows the areas on the driving test report.")

    ### Weekly lessons, and a diary that works without signal

    Most learners come at the same time each week, so a driving instructor diary app that books a
    weekly lesson until you stop it saves more taps than anything else. Lessons also happen in car
    parks and on country roads, so check the app still opens your day when there is no signal.

    ![A driving instructor's diary in week view, with each lesson's time, learner and whether it is paid](diary-week "The diary's week view: every lesson with its learner, its length and whether it is paid.")

    ### Books ready for Making Tax Digital

    From 6 April 2026, self-employed instructors with qualifying income over £50,000 keep digital
    records and send HMRC a summary every quarter. The threshold falls to £30,000 in April 2027 and
    £20,000 in April 2028. An app that records every payment as it happens, and keeps your expenses
    with their receipts, turns that into a short job. Our guide to
    [Making Tax Digital for driving instructors](/guides/making-tax-digital-for-driving-instructors)
    has the dates.

    ## What driving instructor software costs in 2026

    Prices for one instructor, as each company's own pricing page showed them on ${comparedOnWords}:

    | App and plan | A month | Learners book online |
    |---|---|---|
    | ${brand.name} Free, up to ${ours.freeLearners} learners | £0 | Included |
    | ${brand.name} Pro | ${ours.proMonthly}, or ${ours.proYearly} a year | Included |
    | ${totalDrive.name} ${basic.name} | ${cheapest} | Not included |
    | ${totalDrive.name} ${ultimate.name} | ${formatPence(ultimate.pence)} | Included |
    | ${totalDrive.name} ${tdPro.name} | ${formatPence(tdPro.pence)} | Not included |
    | ${totalDrive.name} ${elite.name} | ${dearest} | Included |
    | ${myDriveTime.name} For Individuals | ${formatPence(myDriveTime.pence)} | Invites learners to fill your gaps |

    ${totalDrive.name}'s prices include VAT. ${totalDrive.name} and ${myDriveTime.name} both have a
    free plan for trainee instructors, and both offer a 30 day free trial. Our
    [comparison of ${totalDrive.name}, ${myDriveTime.name} and ${brand.name}](/guides/${comparisonSlug})
    goes through them feature by feature.

    ### What it costs for each lesson

    The monthly price matters less than it looks. If you teach 25 one hour lessons a week, about 108
    a month, a ${ours.proMonthly} plan costs about ${String(pencePerLesson(ours.proMonthlyPence))}p a lesson and a
    ${dearest} plan about ${String(pencePerLesson(elite.pence))}p. A card payment costs more than either:
    ${String(cardFeePence(lesson))}p on a ${formatPence(lesson)} lesson. So ask who pays the card fee,
    and whether the app takes a share of each payment on top. In DVSA's 2025 survey, the most common
    price for an hour's lesson was £36 to £40, charged by 50.3% of instructors, and 56.6% of
    instructors worked at least 25 hours a week.

    ## Questions to ask before you choose

    1. Can learners book online on the plan I would pay for, or only on a dearer one?
    2. Where does card money go, how soon, and does the app take a share of it?
    3. What will it cost with the number of learners I have now, and next year?
    4. Can I bring my learners across from a spreadsheet, and take my records with me if I leave?
    5. Does it work in the car with no signal?
    6. Can my learners see their lessons, payments and progress without paying anything?
    7. Does it fit the 2026 test booking rules? Since 12 May 2026 only the learner can book their car driving test, so no app should offer to book it for you. See [how the 2026 booking rules work](/guides/driving-test-booking-rules-2026).
    8. Who answers when something goes wrong, and how quickly?

    ## Moving your learners to a new app

    1. Save your learners from your current app, or your phone's contacts, as a spreadsheet in CSV format.
    2. Import them into the new app, then check their phone numbers and any hours they have paid for.
    3. Share your booking link in your messages and your social media bio, and as a QR code on a card in the car.
    4. Book everybody's weekly lessons into the new diary.
    5. Keep the old app until the lessons booked in it have happened, then close it.

    ![An instructor's booking link with buttons to copy it and share it on WhatsApp and Instagram, and a QR code](booking-link "Your booking link in the app, with a QR code to print on a card or a sticker for the car.")

    ## Software for driving schools

    A driving school needs all of the above for each instructor, with the office's view on top:
    every instructor's diary in one place, learners shared out between instructors, the school's
    own prices, and franchise fees or pay statements for instructors. ${totalDrive.name},
    ${myDriveTime.name} and ${brand.name} all price a school by the instructor: ${brand.name}'s School
    plan is ${ours.schoolMonthly} a month for the school and ${ours.perInstructorMonthly} for each instructor. See [driving school software](/driving-schools-software).

    ## Where ${brand.name} fits

    ${brand.name} is [driving instructor software](/instructors-software) made for UK instructors.
    Learners book your free times from your own link and pay by card, Apple Pay or Google Pay before
    the lesson. The money goes to your own Stripe account, and ${brand.name} takes nothing from
    lessons with your own learners. Cash and bank transfers are recorded in two taps, weekly
    lessons book themselves, reminders go the day before and two hours before, and a lesson record
    takes under a minute. It works without signal.

    Free carries up to ${ours.freeLearners} learners. Pro, at ${ours.proMonthly} a month or
    ${ours.proYearly} a year, adds unlimited learners, up to ${ours.proTexts} text reminders a month,
    charging a saved card before each lesson, and expenses and exports ready for Making Tax
    Digital. Calendar sync and messages with your learners are coming, and are not there yet.
  `,
  questions: [
    {
      question: 'What is the best driving instructor app in the UK?',
      answer: `It depends on what you want most. Of the three in our comparison, ${totalDrive.name} has the most teaching tools and links to accounting software, ${myDriveTime.name} shares your diary with Google, Apple and Outlook calendars, and ${brand.name} includes online booking and card payments on every plan and is free for up to ${ours.freeLearners} learners.`,
    },
    {
      question: 'Is there a free driving instructor app?',
      answer: `Yes. ${brand.name}'s Free plan is free for any instructor with up to ${ours.freeLearners} learners, with online booking and card payments included. ${totalDrive.name} and ${myDriveTime.name} are free for trainee instructors.`,
    },
    {
      question: 'How much does driving instructor software cost?',
      answer: `For one instructor, from £0 to ${dearest} a month among the apps in this guide on ${comparedOnWords}: ${brand.name} £0 or ${ours.proMonthly}, ${totalDrive.name} ${cheapest} to ${dearest}, and ${myDriveTime.name} ${formatPence(myDriveTime.pence)}. Card payments cost extra, usually a percentage of each payment plus a few pence.`,
    },
    {
      question: 'Can learners book driving lessons online?',
      answer:
        "Yes, when their instructor's app has online booking. The learner opens the instructor's link, sees their free times and books one, and with card payments on, pays at the same time.",
    },
    {
      question: 'Do I need software to be a driving instructor?',
      answer:
        'DVSA does not require it. Making Tax Digital does need digital records from self-employed instructors with qualifying income over £50,000 from 6 April 2026, over £30,000 from April 2027 and over £20,000 from April 2028.',
    },
    {
      question: "Can driving instructor software book a learner's driving test?",
      answer: 'No. Since 12 May 2026 only the learner can book, change, swap or cancel their car driving test, so no app should book one for you.',
    },
  ],
  sources: [
    {
      label: 'GOV.UK: Working as a driving instructor survey: 2025 results',
      url: 'https://www.gov.uk/government/publications/working-as-a-driving-instructor-survey-2025-results/working-as-a-driving-instructor-survey-2025-results',
    },
    {
      label: 'GOV.UK: Find out if and when you need to use Making Tax Digital for Income Tax',
      url: 'https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax',
    },
    { label: 'GOV.UK: Changes to driving test booking rules in 2026', url: 'https://www.gov.uk/guidance/changes-to-driving-test-booking-rules-in-2026' },
    { label: `${totalDrive.name}: Instructor software pricing`, url: totalDrive.pricingUrl },
    { label: `${myDriveTime.name}: Pricing`, url: myDriveTime.pricingUrl },
    { label: `${myDriveTime.name}: Diary management`, url: myDriveTime.diaryUrl },
    { label: 'Stripe: Pricing for UK businesses', url: stripePricingUrl },
  ],
  related: [comparisonSlug, 'sidcup-belvedere-erith-driving-test-centres', 'making-tax-digital-for-driving-instructors'],
};
