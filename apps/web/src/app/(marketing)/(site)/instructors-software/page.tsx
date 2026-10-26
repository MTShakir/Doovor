import { brand } from '@repo/config/brand';
import { foundingOffer, getEntitlements, plans } from '@repo/config/plans';
import { foundingTermWords } from '@repo/core/founding';
import { guides } from '@repo/core/guides';
import { formatPence } from '@repo/core/money';
import { referralRewardMonths } from '@repo/core/referral';
import { siteShareCard } from '@repo/core/share-card';
import { Bell, FileSpreadsheet, Gift, MessageCircleQuestionMark, Percent, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { GuideCard } from '@/components/guides/guide-parts';
import {
  BookingGlimpse,
  GlimpseAlone,
  GlimpsePair,
  MoneyGlimpse,
  ProfileGlimpse,
  ProgressGlimpse,
  TaxYearGlimpse,
  TodayGlimpse,
} from '@/components/site/glimpses';
import {
  Band,
  ClosingCall,
  FeatureGrid,
  FeatureStory,
  FoundingBadge,
  FoundingOffer,
  PageHero,
  PlanCard,
  PrimaryLink,
  QuestionList,
  SecondaryLink,
  Steps,
} from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { foundingPlaces } from '@/lib/site/founding';
import { foundingPrice, planSummaries } from '@/lib/site/plan-features';

/**
 * The page for driving instructors (PRD 8.3, M5-09, D-251): what the app does for one, told
 * feature by feature beside a glimpse of it, and what it costs, with the founding offer's real
 * count wherever it is offered. Every feature here is built; what is coming stays on the plans,
 * marked as coming (D-116).
 */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Driving instructor software: bookings, payments and lesson records',
    description: `Learners book your free times and pay before the lesson. Your diary, payments, lesson records and tax year in one simple app, made for UK driving instructors. Free to start on ${brand.name}.`,
    path: '/instructors-software',
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

const stories = [
  {
    id: 'bookings',
    eyebrow: 'Bookings',
    title: 'Learners book themselves',
    description:
      'Share your booking link and learners pick from the times you are free, at your prices. No more back and forth over messages to find a slot.',
    points: [
      { text: 'Your own booking link, with a QR code for WhatsApp, Instagram and anywhere else' },
      { text: 'Instant booking, or requests you accept from your diary' },
      { text: 'Weekly lessons that book themselves, for as many weeks as you like' },
      { text: 'Never double booked, with time kept free between lessons' },
      { text: 'Your cancellation policy applied for you, late fees included' },
    ],
    visual: (
      <GlimpseAlone>
        <BookingGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'payments',
    eyebrow: 'Payments',
    title: 'Paid before the lesson, not chased after it',
    description:
      'Learners pay by card, Apple Pay or Google Pay when they book, or from hours they bought in a package. The money goes to your own account.',
    points: [
      { text: 'Card payments straight to your bank, through Stripe' },
      { text: 'Packages of hours, paid up front and used lesson by lesson' },
      { text: 'Cash and bank transfers recorded in two taps' },
      { text: 'A receipt emailed for every payment' },
      { text: 'The saved card charged the day before each lesson', pro: true },
    ],
    visual: (
      <GlimpseAlone>
        <MoneyGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'your-day',
    eyebrow: 'Your day',
    title: 'Your whole day on one screen',
    description: 'Every lesson, where to pick each learner up and who has paid. Learners are reminded before each lesson, so they turn up.',
    points: [
      { text: 'Day, week and month views of your diary' },
      { text: 'Pickup points on a map for every learner' },
      { text: 'Reminders by email and app notification, the day before and two hours before' },
      { text: 'Text message reminders as well', pro: true },
      { text: 'Works without signal, and catches up when you are back online' },
    ],
    visual: (
      <GlimpseAlone>
        <TodayGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'lesson-records',
    eyebrow: 'Lesson records',
    title: 'Lesson records in under a minute',
    description: 'Tap the skills you covered, rate each one from 1 to 5 and add a line. Your learner sees their progress straight away, so they know what to practise.',
    points: [
      { text: 'Skills from the areas on the driving test report' },
      { text: 'A focus for next time, and homework when you set it' },
      { text: 'Your learner sees every record and a skill map of their progress' },
      { text: 'Written in a car park with no signal, and saved when there is' },
    ],
    visual: (
      <GlimpseAlone>
        <ProgressGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'getting-found',
    eyebrow: 'Getting found',
    title: 'A profile that wins you learners',
    description: 'Your own page with your prices, where you teach and your next free times, listed for learners looking for lessons near you.',
    points: [
      { text: 'The Verified tick, once we have checked your badge' },
      { text: 'Listed on the driving lessons pages for the areas you cover' },
      { text: 'Learners who passed with you, in a gallery on your profile', pro: true },
      { text: 'Your own colours on your booking page', pro: true },
    ],
    visual: (
      <GlimpseAlone>
        <ProfileGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'money-and-tax',
    eyebrow: 'Money and tax',
    title: 'Your tax year, ready for your accountant',
    description: 'What came in this week, this month and this tax year, and what is still owed. Keep your expenses and miles as you go, not in a rush in January.',
    points: [
      { text: 'Income, unpaid lessons and refunds by week, month and tax year' },
      { text: 'Expenses with a photo of the receipt', pro: true },
      { text: 'Mileage at HMRC rates, or running costs for a dual control car', pro: true },
      { text: 'Exports by tax year and quarter, ready for Making Tax Digital software', pro: true },
    ],
    visual: (
      <GlimpseAlone>
        <TaxYearGlimpse />
      </GlimpseAlone>
    ),
  },
] as const;

const alsoIncluded = [
  {
    icon: Users,
    title: 'Every learner in one list',
    description: 'From enquiry to passed, with their lessons, balance and test date, and notes only you can see.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Bring your learners with you',
    description: 'Import them from a spreadsheet, or send each one an invite by WhatsApp, text or email.',
  },
  {
    icon: Bell,
    title: 'Know as soon as anything changes',
    description: 'A notification when a learner books, moves or cancels a lesson, and when they pay.',
  },
  {
    icon: Gift,
    title: 'Free months for telling a friend',
    description: `${String(referralRewardMonths)} month of Pro free for every instructor who joins from your link, with nothing to claim.`,
  },
  {
    icon: Percent,
    title: 'A price that comes down',
    description: 'The longer you stay on Pro, the less you pay for it, without asking.',
  },
  {
    icon: MessageCircleQuestionMark,
    title: 'Help from real people',
    description: 'Tell us anything from the app, with a screenshot if it helps, and get a reference and a reply.',
  },
] as const;

const steps = [
  { title: 'Your name and photo', description: 'How learners will see you.' },
  { title: 'Your badge', description: 'Your ADI or PDI number and a photo of your badge.' },
  { title: 'Where you teach', description: 'Your base postcode and how far you travel.' },
  { title: 'Your prices', description: 'An hourly price, and a package if you sell one.' },
  { title: 'Your hours', description: 'The times you usually teach each week.' },
] as const;

function questions(term: string, termNoun: string) {
  const pro = plans.pro;
  return [
    {
      question: 'Is it really free?',
      answer: `Yes. The Free plan is free for as long as you use it, for up to ${String(getEntitlements('free').activeLearners ?? 0)} learners at a time. Pro is free for ${term} for the first ${String(foundingOffer.instructorLimit)} instructors, and you do not need a card for either.`,
    },
    {
      question: `What happens when my free ${termNoun} ends?`,
      answer: `You choose. Keep Pro at ${formatPence(pro.monthlyPricePence)} a month or ${formatPence(pro.yearlyPricePence ?? pro.monthlyPricePence * 12)} a year, or carry on with the Free plan. Nothing is ever charged unless you choose Pro and add a card.`,
    },
    {
      question: 'Do my learners pay anything extra?',
      answer: 'No. Learners pay for their lessons at the prices you set, and nothing more. Stripe’s standard card fee comes out of the payment to you, as it would with any card machine.',
    },
    {
      question: 'Who holds the money?',
      answer: `You do. Card payments go to your own Stripe account and on to your bank, and packages of hours are credit with you only. ${brand.name} never holds your learners’ money.`,
    },
    {
      question: 'Can I bring my learners from another app?',
      answer: 'Yes. Import them from a spreadsheet in a few minutes, or invite them one by one by WhatsApp, text or email.',
    },
    {
      question: 'Does it work without signal?',
      answer: 'Today, your lessons and your lesson records open without signal once you have opened them with it, and anything you write is saved when you are back online.',
    },
  ];
}

export default async function InstructorsSoftwarePage() {
  const appUrl = getAppUrl();
  const places = await foundingPlaces();
  const signUp = `${appUrl}/sign-up?role=instructor`;
  const [free, pro] = planSummaries();
  const term = foundingTermWords(places?.months ?? foundingOffer.months);
  // "Claim your free year", not "your free 1 year".
  const termNoun = term.replace(/^1 /, '');
  // The offer's own words on the buttons while it is open, and plain words once it has closed.
  const open = places !== null && !places.instructors.full;
  const start = open ? `Claim your free ${termNoun}` : 'Create your free account';
  return (
    <>
      <PageHero
        badge={<FoundingBadge places={places} />}
        eyebrow="For driving instructors"
        title="Less admin. More lessons. Paid on time."
        description="Learners book your free times from your own link and pay before they get in the car. Your diary, payments, lesson records and tax year in one simple app, made for UK driving instructors."
        actions={
          <>
            <PrimaryLink href={signUp}>{start}</PrimaryLink>
            <SecondaryLink href="#instructor-plans">See pricing</SecondaryLink>
          </>
        }
        note="No card needed. Set up in five short steps."
        visual={<GlimpsePair back={<TodayGlimpse />} front={<MoneyGlimpse />} />}
      />

      {stories.map((story, index) => (
        <FeatureStory key={story.id} {...story} flip={index % 2 === 1} tone={index % 2 === 0 ? 'grey' : 'white'} />
      ))}

      <Band id="also-included" title="And everything around it" description="The things that save you a few minutes every day, on every plan unless it says otherwise." tone="grey">
        <FeatureGrid features={alsoIncluded} tone="grey" />
      </Band>

      <Band id="set-up" title="Set up in five short steps" description="Skip any step but the first, and come back to it when you like.">
        <Steps steps={steps} />
      </Band>

      <FoundingOffer places={places} action={<PrimaryLink href={signUp}>{start}</PrimaryLink>} />

      {free && pro ? (
        <Band id="instructor-plans" title="Start free, with Pro when you want it">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <PlanCard plan={free} signUpUrl={signUp} />
            <PlanCard plan={pro} signUpUrl={signUp} highlighted founding={foundingPrice(pro, places)} />
          </div>
        </Band>
      ) : null}

      <Band id="instructor-questions" title="Questions instructors ask" tone="grey">
        <QuestionList questions={questions(term, termNoun)} />
      </Band>

      {/* The newest guides for instructors: choosing an app, comparing them, teaching locally (D-387). */}
      <Band id="instructor-guides" title="Read before you choose" description="Guides for driving instructors, with every fact sourced.">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
          {guides
            .filter((guide) => guide.audience === 'instructors')
            .slice(0, 3)
            .map((guide) => (
              <li key={guide.slug}>
                <GuideCard guide={guide} />
              </li>
            ))}
        </ul>
      </Band>

      <ClosingCall
        title="Your first lesson booked today"
        description="Create your account, add a learner by WhatsApp, and book them in three taps."
        action={
          <PrimaryLink href={signUp} onDark>
            {start}
          </PrimaryLink>
        }
      />
    </>
  );
}
