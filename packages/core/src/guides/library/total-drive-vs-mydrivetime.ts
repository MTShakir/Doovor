import { brand } from '@repo/config/brand';
import { foundingOffer, plans } from '@repo/config/plans';
import { formatPence } from '../../money.ts';
import type { Guide } from '../types.ts';
import { comparedOn, comparedOnWords, comparisonSlug, myDriveTime, ours, stripePricingUrl, totalDrive } from './apps-compared.ts';

const [basic, ultimate, tdPro, elite] = totalDrive.plans;
const name = brand.name;
const td = totalDrive.name;
const mdt = myDriveTime.name;
/** Twelve months at a monthly price, as neither company gives a yearly one. */
const yearOf = (pence: number) => formatPence(pence * 12);
const proYearPence = plans.pro.yearlyPricePence ?? plans.pro.monthlyPricePence * 12;

/**
 * Our app beside two of the best known UK driving instructor apps (D-387). Comparative advertising
 * has to be fair to be lawful (CAP Code 3.33 to 3.44): like for like, every claim checkable, the
 * date the prices were read, and nothing said against either of them. So their facts come only
 * from their own pages, read on the day in `apps-compared.ts`; each is given the things it does
 * better; and the guide says what ours does not do yet.
 */
export const totalDriveVsMyDriveTime: Guide = {
  slug: comparisonSlug,
  audience: 'instructors',
  title: `${td} vs ${mdt} vs ${name}: driving instructor apps compared for 2026`,
  description: `${td}, ${mdt} and ${name} side by side: prices checked on ${comparedOnWords}, online booking, card payments, and which suits whom.`,
  summary: `We make ${name}, so in this driving instructor app comparison we have put it beside two of the best known apps for UK driving instructors, using each company's own pages, and said plainly where each one is the better choice.`,
  takeaways: [
    `${name} costs the least of the three: £0 for up to ${ours.freeLearners} learners, or ${ours.proMonthly} a month for Pro, against ${formatPence(basic.pence)} to ${formatPence(elite.pence)} a month for ${td} and ${formatPence(myDriveTime.pence)} for ${mdt}.`,
    `Online booking and card payments are on every ${name} plan, Free included; ${td} includes online booking on its ${formatPence(ultimate.pence)} ${ultimate.name} and ${formatPence(elite.pence)} ${elite.name} plans, and ${mdt} invites learners to fill gaps you choose.`,
    `${td} has the most teaching tools and links to accounting software, and ${mdt} shares your diary with Google, Apple and Outlook calendars; ${name} does neither yet.`,
    'All three let a trainee instructor start without paying.',
  ],
  keywords: [
    'Total Drive vs MyDriveTime',
    'Total Drive alternative',
    'MyDriveTime alternative',
    'how much does Total Drive cost',
    'how much does MyDriveTime cost',
    'driving instructor app comparison',
    'driving instructor software',
  ],
  places: [{ name: 'United Kingdom', region: 'GB' }],
  published: comparedOn,
  updated: comparedOn,
  body: `
    > We make ${name}, so read this knowing that. Every price and feature we give for ${td} and
    > ${mdt} is from their own websites, read on ${comparedOnWords} and linked at the foot of this
    > page. If something has changed, email ${brand.supportEmail} and we will correct it.

    ## At a glance

    | Feature | ${name} | ${td} | ${mdt} |
    |---|---|---|---|
    | One instructor, a month | £0 for up to ${ours.freeLearners} learners, or ${ours.proMonthly} for Pro | ${formatPence(basic.pence)}, ${formatPence(ultimate.pence)}, ${formatPence(tdPro.pence)} or ${formatPence(elite.pence)} | ${formatPence(myDriveTime.pence)} |
    | Learners book online | Every plan | ${ultimate.name} and ${elite.name} | Invites learners to fill gaps |
    | Card payments | Every plan, into your own Stripe account, less Stripe's fee | Optional; 100% of the lesson price paid to you the next day | Records payments; taking cards is not mentioned |
    | Learner app | Free | Free pupil and parent app | Student app |
    | Reminders | Email and app on every plan, texts on Pro | Free lesson reminders | Automated reminders, texts included |
    | Teaching aids | None | Road scenarios and satellite road drawing; 3D videos on ${tdPro.name} and ${elite.name} | Resources and reflective logs |
    | Tax and accounts | Expenses and exports for Making Tax Digital, on Pro | Making Tax Digital; links to QuickBooks, Xero, FreeAgent and Sage | Making Tax Digital; income and expense reports |
    | Trainee instructors | Free plan | PDI Head Start, free | PDI Best Start, free until you qualify |

    ${td}'s prices include VAT, and ${td} and ${mdt} each start with a 30 day free trial.

    ## Five moments in an instructor's week

    ### Sunday evening: a learner wants a lesson

    **${name}**: they open your booking link, see your free times and book one, paying by card,
    Apple Pay or Google Pay as they do. This is on every plan, Free included.

    **${td}**: online booking comes with the ${ultimate.name} plan at ${formatPence(ultimate.pence)} a
    month and ${elite.name} at ${formatPence(elite.pence)}. You set your availability, lesson length,
    travel time and the postcodes you cover.

    **${mdt}**: you book lessons into your diary yourself, and it can invite your learners to fill
    a gap.

    ![A learner choosing a driving lesson time on an instructor's booking page](booking-page "Booking from an instructor's link: lesson, day, free time, and the cancellation policy before they book.")

    ### Monday: getting paid

    **${name}**: card payments go to your own Stripe account. Stripe's standard fee for a UK card is
    ${ours.cardFee}, ${name} takes nothing from lessons with your own learners, and learners never
    pay extra for paying by card. Cash and bank transfers are recorded in two taps.

    **${td}**: card payments are an optional tool that lets parents and pupils pay you through
    the app, and its page says you receive 100% of the lesson price the next day.

    **${mdt}**: it records what each learner has paid, prepaid lessons and your payment history.
    Its website does not mention taking card payments.

    ![An instructor's money screen for the tax year, with card, cash and bank payments and what is unpaid](money "The money screen for the tax year so far: what came in by card, cash and bank transfer, and what is still unpaid. Example figures.")

    ### Wednesday: the lesson itself

    **${name}**: you record the lesson in under a minute by tapping the skills you covered, taken
    from the areas on the driving test report, and your learner sees the record in their app.

    **${td}**: every plan has a progress syllabus, reflective logs, 2D road scenarios and drawing
    on satellite roads. Its ${tdPro.name} and ${elite.name} plans add teaching aids: 3D videos
    covering 36 scenarios.

    **${mdt}**: a progress syllabus, reflective logs, test fault recording, and a monitor that keeps
    you within DVSA's standards check guidelines.

    ### Thursday: the day before a lesson

    **${name}**: reminders go the day before and two hours before, by email and app notification
    on every plan, and by text on Pro, up to ${ours.proTexts} a month.

    **${td}**: free lesson reminders on every plan.

    **${mdt}**: automated reminders of the next lesson, and the diary shows when each was sent and
    whether it arrived. Texts are included on its plan for individual instructors.

    ### Friday: the books

    **${name}**: on Pro, your expenses with a photo of each receipt, and your income and expenses
    by tax year and by quarter, ready for Making Tax Digital software or your accountant. It does
    not send updates to HMRC itself.

    **${td}**: Making Tax Digital on every plan, and links to QuickBooks, Xero, FreeAgent and Sage.

    **${mdt}**: income and expense reports, a monthly income breakdown, expense receipts and a page
    on Making Tax Digital.

    ## What a year costs

    Twelve months at each company's price, as its pricing page showed on ${comparedOnWords}.
    Neither ${td}'s nor ${mdt}'s pricing page gave a yearly price.

    | What you want | ${name} | ${td} | ${mdt} |
    |---|---|---|---|
    | Up to ${ours.freeLearners} learners, booking online | £0 on Free | ${yearOf(ultimate.pence)} on ${ultimate.name} | ${yearOf(myDriveTime.pence)} |
    | Any number of learners, booking online | ${formatPence(proYearPence)} on Pro, paid yearly | ${yearOf(ultimate.pence)} on ${ultimate.name} | ${yearOf(myDriveTime.pence)} |
    | Everything each sells to one instructor | ${formatPence(proYearPence)} on Pro, paid yearly | ${yearOf(elite.pence)} on ${elite.name} | ${yearOf(myDriveTime.pence)} |

    ${mdt}'s price is for its own way of filling gaps, where learners are invited rather than
    booking any free time. Paid monthly, ${name} Pro is ${yearOf(plans.pro.monthlyPricePence)} a
    year. For an instructor whose learners book online, ${name} Pro paid yearly costs
    ${formatPence(ultimate.pence * 12 - proYearPence)} a year less than ${td}'s ${ultimate.name} plan.

    ## Where ${td} is the better choice

    ${td} is used by ${totalDrive.instructors} driving instructors, its information page says, and
    its card payments pay you the whole lesson price the next day. If you teach from diagrams and
    videos, it has the
    most teaching tools, from road scenarios and drawing on satellite roads to 3D videos on its
    ${tdPro.name} and ${elite.name} plans. If your accountant works in QuickBooks, Xero, FreeAgent or
    Sage, it links to them, and it works with Apple CarPlay and Android Auto in the car.

    ## Where ${mdt} is the better choice

    ${mdt} shares your diary with Google, Apple and Outlook calendars, which ${name} cannot do yet.
    It has tools for DVSA's standards check, sends your terms and conditions to learners and keeps
    track of their signatures, and its price for a team falls to £5 a month for each instructor
    after the tenth. Its home page offers a six month money back guarantee.

    ## Where ${name} is the better choice

    If you are looking for a ${td} alternative or a ${mdt} alternative because of the price or
    because you want learners to book online, this is where ${name} is different:

    - **Learners book and pay online without a dearer plan.** Online booking and card payments are on every plan, Free included.
    - **It costs the least.** Free for up to ${ours.freeLearners} learners, and Pro is ${ours.proMonthly} a month or ${ours.proYearly} a year with as many learners as you like.
    - **It is free for qualified instructors, not only trainees**, for up to ${ours.freeLearners} learners and with no end date.

    And on every plan:

    - **Card payments go into your own Stripe account**, and ${name} takes nothing from lessons with your own learners.
    - **Learners pay as they book**, and on Pro the app can charge a card they saved before each lesson.
    - **Weekly lessons book themselves**, and nobody can book a time you are already teaching.
    - **It works without signal**, in a car park or on a country road.
    - **Learners can see you are checked**: your profile shows a blue tick once we have checked your ADI badge.
    - **A founding offer**: while places last, Pro is free for a year for the first ${String(foundingOffer.instructorLimit)} instructors.

    ## What ${name} does not do yet

    - It does not sync with Google or Outlook calendars yet. That is coming to Pro.
    - It has no teaching videos or road diagrams.
    - It does not link to accounting software. It exports your books instead, for your software or your accountant.
    - Messages with your learners in the app are coming. For now, learners call, text or WhatsApp you from their lesson.
    - It is new, and far fewer instructors use it than either of the others.

    ![A learner's lesson screen with buttons to call, text or WhatsApp their instructor](learner-contact "On each lesson, the learner can call, text or WhatsApp their instructor about moving it.")

    ## Moving to ${name}

    1. Save your learners as a spreadsheet in CSV format, from your current app if it lets you, or from your contacts.
    2. Import the file into ${name}, then check each learner's details and any hours they have paid for.
    3. Set your hours, prices and cancellation policy, then share your booking link.
    4. Keep your old app until the lessons booked in it have happened.

    For what to look for in any app, read
    [how to choose driving instructor software](/guides/how-to-choose-driving-instructor-software),
    or [see how ${name} works for instructors](/instructors-software).
  `,
  questions: [
    {
      question: `Is ${td} better than ${mdt}?`,
      answer: `Neither is better for everybody. ${td} has more teaching tools, links to accounting software, and online booking on its ${ultimate.name} and ${elite.name} plans. ${mdt} shares your diary with your calendars and has standards check tools, at ${formatPence(myDriveTime.pence)} a month.`,
    },
    {
      question: `How much does ${td} cost?`,
      answer: `${formatPence(basic.pence)} a month for ${basic.name}, ${formatPence(ultimate.pence)} for ${ultimate.name}, ${formatPence(tdPro.pence)} for ${tdPro.name} and ${formatPence(elite.pence)} for ${elite.name}, including VAT, on its pricing page on ${comparedOnWords}, after a 30 day free trial. Online booking is on ${ultimate.name} and ${elite.name}.`,
    },
    {
      question: `How much does ${mdt} cost?`,
      answer: `${formatPence(myDriveTime.pence)} a month for an instructor on their own, on its pricing page on ${comparedOnWords}, after a 30 day free trial with no card needed. It is free for trainee instructors until they qualify, and schools pay less for each extra instructor.`,
    },
    {
      question: `What is a cheaper alternative to ${td}?`,
      answer: `${name}. Its Free plan carries up to ${ours.freeLearners} learners with online booking and card payments, and Pro costs ${ours.proMonthly} a month or ${ours.proYearly} a year. ${td} has more teaching tools and links to accounting software.`,
    },
    {
      question: 'Which driving instructor app has online booking and card payments on every plan?',
      answer: `Of these three, ${name}. ${td} includes online booking on its ${ultimate.name} and ${elite.name} plans, and ${mdt}'s website does not mention taking card payments.`,
    },
    {
      question: `Can I move from ${td} or ${mdt} to ${name}?`,
      answer: `Yes. Save your learners as a CSV file and import them into ${name}, or add them one at a time, then share your booking link. Keep your old app until the lessons booked in it have happened.`,
    },
  ],
  sources: [
    { label: `${td}: Instructor software pricing`, url: totalDrive.pricingUrl },
    { label: `${td}: Information about ${td}`, url: totalDrive.aboutUrl },
    { label: `${td}: Take card payments`, url: totalDrive.paymentsUrl },
    { label: `${mdt}: Home page, features and guarantee`, url: myDriveTime.homeUrl },
    { label: `${mdt}: Pricing`, url: myDriveTime.pricingUrl },
    { label: `${mdt}: Diary management`, url: myDriveTime.diaryUrl },
    { label: `${mdt}: Finance management`, url: myDriveTime.financeUrl },
    { label: 'Stripe: Pricing for UK businesses', url: stripePricingUrl },
    {
      label: 'GOV.UK: Find out if and when you need to use Making Tax Digital for Income Tax',
      url: 'https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax',
    },
  ],
  related: ['how-to-choose-driving-instructor-software', 'sidcup-belvedere-erith-driving-test-centres', 'making-tax-digital-for-driving-instructors'],
};
