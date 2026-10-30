import { brand } from '@repo/config/brand';
import { foundingOffer, freeTrial, getEntitlements, plans, standardCardFee } from '@repo/config/plans';
import { formatPence } from '@repo/core/money';
import { siteShareCard } from '@repo/core/share-card';
import { Button } from '@repo/ui/button';
import { CreditCard, Handshake, Landmark, MessageCircle, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import {
  BookingGlimpse,
  GlimpseAlone,
  GlimpsePair,
  MoneyGlimpse,
  ProfileGlimpse,
  ProgressGlimpse,
  ReminderGlimpse,
  TaxYearGlimpse,
  TodayGlimpse,
} from '@/components/site/glimpses';
import filmPoster from '@/components/site/images/join-film.webp';
import setupGuidePoster from '@/components/site/images/setup-guide.webp';
import { SignUpLink, StickyAction } from '@/components/site/join-actions';
import { BookingFacade, VideoFacade } from '@/components/site/join-embeds';
import { FilmPlayer } from '@/components/site/join-film';
import {
  ActionRow,
  CostPanel,
  FactList,
  FilmBand,
  FounderNote,
  JobList,
  JoinHero,
  PriceLines,
  TextBubbles,
  type TextMessage,
} from '@/components/site/join-parts';
import {
  Band,
  ClosingCall,
  FeatureStory,
  FoundingBadge,
  FoundingOffer,
  QuestionAccordion,
  SignalEyebrow,
  Steps,
} from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { joinFilm } from '@/lib/site/film';
import { foundingPlaces } from '@/lib/site/founding';
import { joinActionWords, joinOpening, offerTermWords } from '@/lib/site/join';

/**
 * The page the printed QR codes open (PRD 8.3, 9.18, D-404): for an independent instructor who has
 * a minute between lessons, on a phone, and a reason to doubt another app. It goes in the order
 * they ask: is this for me, what is it, what does it cost now and later, who holds the money,
 * who is behind it, and the answers to what stops them. Every product line is one the site
 * already makes for instructors, and every figure comes from the configuration. The setup video
 * and a free onboarding call can be had from the page, and its button comes again at the end of
 * each part (D-406).
 *
 * Out of search, which the page for instructors is in, so the two do not compete for the same words.
 */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'For driving instructors: less admin, paid on time',
    description: `Learners book your free times from your own link and pay before the lesson, straight to your own account. Free to start, with no card needed, on ${brand.name}.`,
    path: '/join',
    indexable: false,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

/** Who stands behind it, and where they will set it up in person (Launch Playbook, sections 1 and 2). */
const founder = { name: 'Talha Shakir', firstName: 'Talha', jobTitle: 'Founder', place: 'Belvedere' } as const;
const patch = 'Bexley, Greenwich or Dartford';

/**
 * What the product owner has agreed this page may show (D-405). The number is shown only where a
 * person may really be needed (D-277), and on 26 October 2026 the owner said this page is one, as
 * the printed pieces are. A photo of the founder waits: the launch's pictures show no real faces.
 */
const ownerAgreed: { whatsApp: boolean; founderPhoto: string | null } = { whatsApp: true, founderPhoto: null };

/**
 * The setup tutorial on the brand's YouTube channel (D-406): the real app, set up from nothing on
 * a phone, from the week 2 launch pack. Its thumbnail is the owner's own, kept with the page, and
 * says 7 minutes, as the tutorial runs 6:31 (D-410). The ID's eighth letter is a capital I, which
 * looks like the lowercase l after it: with an l there, YouTube has no such video (D-410).
 */
const setupGuide = { videoId: 'NXm0hbDIRlY', title: `How to set up your driving instructor diary in ${brand.name}`, length: '6:31' } as const;

/**
 * The page's own film (D-408): the whole story in under four minutes, the owner's voice over the
 * app's own screens, hosted with the site (film.ts, where the file is held to one every browser
 * plays). Its last frame points down to the button under it. Its band asks for the four minutes and
 * says what they buy, on black, so the yellow button under it stands out (D-410).
 */
const film = { ...joinFilm, hook: { before: 'Give us 4 minutes. ', marked: 'Get your evenings back.' } } as const;

/** One late cancellation a week, at a £40 lesson, over a year: how the leaflet works it out. */
const lessonPence = 4000;
const weeksInAYear = 52;

const oldWay: readonly TextMessage[] = [
  { from: 'Amir', at: '23:12', text: 'Hiya, can we move Thursday?', cost: 'Your evenings, gone on texts.' },
  { from: 'Mia', at: '22:03', text: 'I’ll transfer it tonight x', cost: 'Money you’ve earned, still owed.' },
  { from: 'Jack', at: '07:58', text: 'So sorry, can’t make it today', cost: `A late cancel. An empty slot, ${formatPence(lessonPence)} gone.` },
  { from: 'Olivia', at: '18:05', text: 'What should I practise next?', cost: 'Notes on paper she never sees.' },
];

const whatItCosts = [
  { title: 'Your evenings', description: 'On texts, after a full day of teaching.' },
  { title: 'Your Sundays', description: 'On the diary, the bank app and the books.' },
  { title: 'Your money', description: 'Still with learners, for lessons you’ve taught.' },
] as const;

const steps = [
  { title: 'Your badge and your week', description: 'Your ADI or PDI number, where you teach, your prices and your hours.' },
  { title: 'Bring your learners', description: 'From a spreadsheet, or invite each one by WhatsApp, text or email.' },
  { title: 'Switch on payments', description: 'Your bank details go to Stripe, so card payments reach you.' },
] as const;

/** Where the day's learners are picked up, in the patch the printed pieces go to. */
const pickups = ['Belvedere', 'Erith', 'Bexleyheath'] as const;

/**
 * What the app takes off an instructor's list (D-410), each in its own part, told in a line or two
 * beside how it looks in the app (D-411). Every one is something the app does today, and what is
 * on Pro says so. The cards at the top of them are made from these, so a card and the part it goes
 * down to always say the same.
 */
const stories = [
  {
    id: 'diary',
    eyebrow: 'Your day',
    title: 'Your diary, made easy',
    description: 'Every lesson, where to pick each learner up and who has paid, on one screen.',
    points: [{ text: 'Day, week and month views of your diary' }, { text: 'Time kept free between lessons' }],
    visual: (
      <GlimpseAlone>
        <TodayGlimpse pickups={pickups} />
      </GlimpseAlone>
    ),
  },
  {
    id: 'your-page',
    eyebrow: 'Getting found',
    title: 'Your own page, booking link and gallery',
    description: 'Your prices, where you teach and your next free times, on a page learners near you can find.',
    points: [
      { text: 'Your own booking link, with a QR code for WhatsApp, Instagram and anywhere else' },
      { text: 'Learners who passed with you, in a gallery on your page', pro: true },
    ],
    visual: (
      <GlimpseAlone>
        <ProfileGlimpse area={pickups[0]} />
      </GlimpseAlone>
    ),
  },
  {
    id: 'bookings',
    eyebrow: 'Bookings',
    title: 'Learners book your free times',
    description: 'From your own link, at your prices, with no back and forth over messages to find a slot.',
    points: [{ text: 'Nothing is ever booked twice' }, { text: 'Weekly lessons that book themselves' }],
    visual: (
      <GlimpseAlone>
        <BookingGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'reminders',
    eyebrow: 'Reminders',
    title: 'Automatic text and email reminders',
    description: 'Learners are reminded the day before and two hours before each lesson, so they turn up.',
    points: [{ text: 'By email and app notification, on every plan' }, { text: 'By text message as well', pro: true }],
    visual: (
      <GlimpseAlone>
        <ReminderGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'lesson-records',
    eyebrow: 'Lessons',
    title: 'Directions in a tap, records in a minute',
    description:
      'One tap on Navigate opens directions to the pickup. After the lesson, tap the skills you covered and rate each one, and your learner sees their progress straight away.',
    points: [{ text: 'Skills from the areas on the driving test report' }, { text: 'Works without signal, and catches up when you are back online' }],
    visual: (
      <GlimpseAlone>
        <ProgressGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'payments',
    eyebrow: 'Payments',
    title: 'Paid before the lesson, late cancels covered',
    description:
      'Learners pay by card, Apple Pay or Google Pay, straight to your own account. Your cancellation policy is shown before they book, and applied for you, late fees included.',
    points: [{ text: `${brand.name} never holds the money` }, { text: 'Cash and bank transfers recorded in two taps' }],
    visual: (
      <GlimpseAlone>
        <MoneyGlimpse />
      </GlimpseAlone>
    ),
  },
  {
    id: 'books',
    eyebrow: 'Money and tax',
    title: 'Bookkeeping in a few taps',
    description: 'What came in this week, this month and this tax year, and what is still owed. Expenses go in as you go, not in a rush in January.',
    points: [
      { text: 'Expenses with a photo of the receipt', pro: true },
      { text: 'Exports by tax year or quarter, for your accountant or Making Tax Digital software', pro: true },
    ],
    visual: (
      <GlimpseAlone>
        <TaxYearGlimpse />
      </GlimpseAlone>
    ),
  },
] as const;

/** What of each part is on Pro, said on its card as well as beside the points that are. */
const onPro: Partial<Record<(typeof stories)[number]['id'], string>> = { 'your-page': 'Gallery on Pro', reminders: 'Texts on Pro', books: 'On Pro' };

/** The cards at the top of the parts, each going down to its own. */
const jobs = stories.map((story) => ({ title: story.title, href: `#${story.id}`, pro: onPro[story.id] }));

const fairAndLocal = [
  {
    icon: Landmark,
    title: 'Your money goes straight to you',
    description: `Card payments go to your own Stripe account and on to your bank. ${brand.name} never holds learners’ money.`,
  },
  { icon: CreditCard, title: 'Booking and card payments, free', description: 'Both on the Free plan, with no upgrade needed.' },
  { icon: Smartphone, title: 'Free for your learners', description: 'They book, pay and see their progress in a free app, and never pay extra.' },
  {
    icon: Handshake,
    title: 'Set up with you',
    description: `In person anywhere in ${patch}, or on a free call from anywhere else. ${founder.firstName} does the typing.`,
  },
] as const;

/** "1.5% plus 20p", as a card fee is said. */
function cardFeeWords(): string {
  return `${String(standardCardFee.basisPoints / 100)}% plus ${String(standardCardFee.fixedPence)}p`;
}

/** Pro's prices, from the configuration: "£12 a month or £120 a year". */
function proPriceWords(): string {
  const pro = plans.pro;
  return `${formatPence(pro.monthlyPricePence)} a month or ${formatPence(pro.yearlyPricePence ?? pro.monthlyPricePence * 12)} a year`;
}

const freeLearners = String(getEntitlements('free').activeLearners ?? 0);

/** Today, the year ahead, after that, and on each card payment, while the founding places are open or not. */
function priceLines(open: boolean, term: string) {
  return [
    { when: 'Today', what: `${formatPence(0)}. Free to start, with no card needed.` },
    open
      ? { when: `Your first ${term.replace(/^a /, '')}`, what: `Pro free, as one of the first ${String(foundingOffer.instructorLimit)} instructors.` }
      : { when: 'To begin with', what: 'Pro free for a while, as every new business has it.' },
    {
      when: 'After that',
      what: `Pro at ${proPriceWords()}, or the Free plan, free for as long as you use it, for up to ${freeLearners} learners at a time.`,
    },
    {
      when: 'Each card payment',
      what: `Stripe’s fee of about ${cardFeeWords()}. ${brand.name} takes nothing from lessons with your own learners.`,
    },
  ];
}

/** The objections that stop instructors signing up, answered as the founder answers them (Launch Playbook 4.4). */
function questions(open: boolean) {
  const after = open ? 'the year' : 'your free time';
  return [
    {
      question: 'I already use another app.',
      answer:
        'Keep it while you try this. Run both side by side for a fortnight, and bring your learners over from a spreadsheet, which most apps can save. Online booking and card payments are on the Free plan here, with no upgrade needed. If it’s not better, stay where you are.',
    },
    {
      question: 'What’s the catch?',
      answer: open
        ? `You’re one of the first ${String(foundingOffer.instructorLimit)}, and I want you to tell me what’s broken. After the year you choose: keep Pro at ${proPriceWords()}, or carry on with the Free plan. Nothing is ever charged unless you choose Pro and add a card.`
        : `Pro is ${proPriceWords()} once your free time ends, or carry on with the Free plan. Nothing is ever charged unless you choose Pro and add a card.`,
    },
    {
      question: 'What if you shut down?',
      answer: `Your money never sits with us. Card payments go straight to your own Stripe account and on to your bank, so nothing you’re owed is ever held by ${brand.name}. On Pro, your income and expenses export for your accountant whenever you like.`,
    },
    {
      question: 'My learners won’t use an app.',
      answer:
        'They don’t have to. You can add a learner yourself, book their lessons and mark cash or a bank transfer paid in two taps. The ones who will can book and pay from your link on their phone, in a free app, and never pay extra.',
    },
    {
      question: 'I’m not good with tech.',
      answer: `That’s the test. If you can’t set it up in ten minutes, it’s my fault, and I’ll fix it. Book a free call and I’ll do it with you on the phone, or anywhere in ${patch} I’ll set it up with you in person. Either way, I do the typing.`,
    },
    {
      question: `What happens after ${after}?`,
      answer: `You choose. Keep Pro at ${proPriceWords()}, or carry on with the Free plan, which stays free for up to ${freeLearners} learners at a time. Nothing is charged unless you choose Pro and add a card.`,
    },
    {
      question: 'Can I bring my learners?',
      answer: 'Yes. Import them from a spreadsheet, or invite each one by WhatsApp, text or email. If I set you up, on a call or in person, we do the import together.',
    },
    {
      question: 'Does it work without signal?',
      answer: 'Yes. Your lessons and lesson records open without signal once you’ve opened them with it, and anything you write is saved when you’re back online.',
    },
  ];
}

/** Where anybody can check the company is real: its entries in the public registers. */
const registers = {
  company: `https://find-and-update.company-information.service.gov.uk/company/${brand.company.number}`,
  dataProtection: `https://ico.org.uk/ESDWebPages/Entry/${brand.icoRegistration}`,
};

export default async function JoinPage() {
  const appUrl = getAppUrl();
  const places = await foundingPlaces();
  const signUp = `${appUrl}/sign-up?role=instructor`;
  const open = places !== null && !places.instructors.full;
  const action = joinActionWords(places);
  const term = offerTermWords(places?.months ?? foundingOffer.months);
  const whatsApp = `${brand.supportPhone.whatsApp}?text=${encodeURIComponent(`Hi ${founder.firstName}, I’m a driving instructor and I’d like a founding place on ${brand.name}.`)}`;

  return (
    <>
      <JoinHero
        opening={joinOpening}
        badge={<FoundingBadge places={places} />}
        actions={
          <div id="opening-action" className="flex w-full flex-col md:w-auto">
            <SignUpLink href={signUp}>{action}</SignUpLink>
          </div>
        }
        // A space that does not break, so "minutes" never sits on a line of its own.
        note={'Free to start. No card needed. Set up in about 10\u00a0minutes.'}
        visual={<GlimpsePair back={<TodayGlimpse pickups={pickups} />} front={<MoneyGlimpse />} />}
      />

      <FilmBand id="film" title={film.hook}>
        <FilmPlayer src={film.src} captions={film.captions} title={film.title} length={film.length} poster={filmPoster} />
        {/* Straight under the film, where its last frame points. */}
        <ActionRow id="action-film" stacked onDark aside="Free to start. No card needed.">
          <SignUpLink href={signUp} highlight>
            {action}
          </SignUpLink>
        </ActionRow>
      </FilmBand>

      <Band id="old-way" eyebrow={<SignalEyebrow lit="red">The old way</SignalEyebrow>} title="Sound familiar?" tone="grey">
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-10 md:grid-cols-2 md:items-center md:gap-16">
          <div className="flex flex-col gap-8">
            <TextBubbles messages={oldWay} />
            <p className="text-h2 text-black">
              Teaching all day. <span className="font-normal text-grey-700">Admin all night.</span>
            </p>
          </div>
          <CostPanel
            figure={formatPence(lessonPence * weeksInAYear)}
            explanation={`a year, if one lesson a week cancels late at ${formatPence(lessonPence)}.`}
            costs={whatItCosts}
          />
        </div>
        <ActionRow id="action-old-way" aside="Free to start. No card needed.">
          <SignUpLink href={signUp}>{action}</SignUpLink>
        </ActionRow>
      </Band>

      <Band
        id="the-fix"
        eyebrow={<SignalEyebrow lit="red-and-amber">The good news</SignalEyebrow>}
        title="It’s a 10 minute fix."
        description={`Set it up once, on your phone. Or ${founder.firstName} sets it up with you, on a free call or in person anywhere in ${patch}.`}
      >
        <Steps steps={steps} />
        <p className="text-small text-grey-700">Your link takes bookings once we have checked your badge against the DVSA register.</p>
        <div className="flex max-w-3xl flex-col gap-3">
          <h3 className="text-h2 text-black">Watch it set up, on a phone</h3>
          <VideoFacade videoId={setupGuide.videoId} title={setupGuide.title} length={setupGuide.length} poster={setupGuidePoster} />
          <p className="text-small text-grey-700">
            Every step from signing up to the first booking. Playing it loads the video from YouTube.{' '}
            <a
              href={`https://www.youtube.com/watch?v=${setupGuide.videoId}`}
              target="_blank"
              rel="noopener"
              className="font-semibold text-blue underline underline-offset-4"
            >
              Watch on YouTube<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
        <ActionRow
          id="action-fix"
          aside={
            <a href="#onboarding-call" className="font-semibold text-blue underline underline-offset-4">
              Or book a free onboarding call
            </a>
          }
        >
          <SignUpLink href={signUp}>{action}</SignUpLink>
        </ActionRow>
      </Band>

      <Band
        id="with-us"
        eyebrow={<SignalEyebrow lit="green">With {brand.name}</SignalEyebrow>}
        title="Your admin, handled. Here’s how."
        description="Seven jobs off your list. Pick one to see it in the app."
        tone="grey"
      >
        <JobList jobs={jobs} />
      </Band>

      {stories.map((story, index) => (
        <FeatureStory
          key={story.id}
          {...story}
          flip={index % 2 === 1}
          tone={index % 2 === 0 ? 'white' : 'grey'}
          // Asked again after the last of the seven, once all of them have been seen.
          action={
            index === stories.length - 1 ? (
              <ActionRow id="action-stories">
                <SignUpLink href={signUp}>{action}</SignUpLink>
              </ActionRow>
            ) : undefined
          }
        />
      ))}

      {/* Seven parts end on white, as this begins, so a hairline keeps them apart (D-411). */}
      <Band id="fair-and-local" eyebrow={<SignalEyebrow lit="green">Why {brand.name}</SignalEyebrow>} title="Fair, simple and local." divided>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-4">
            <h3 className="text-h2 text-black">What it costs, now and later</h3>
            <PriceLines lines={priceLines(open, term)} />
          </div>
          <FactList facts={fairAndLocal} />
        </div>
        <p className="max-w-3xl text-small text-pretty text-grey-700">
          {brand.name} is made by {brand.legalEntity}, registered in {brand.company.registeredIn},{' '}
          <a href={registers.company} className="font-semibold text-blue underline underline-offset-4">
            company number {brand.company.number}
          </a>
          , and on the Information Commissioner’s register of data controllers,{' '}
          <a href={registers.dataProtection} className="font-semibold text-blue underline underline-offset-4">
            {brand.icoRegistration}
          </a>
          .
        </p>
        <ActionRow id="action-fair" aside={`Free for up to ${freeLearners} learners for as long as you use it.`}>
          <SignUpLink href={signUp}>{action}</SignUpLink>
        </ActionRow>
      </Band>

      <Band id="founder" eyebrow="Who’s behind it" title={`Hi, I’m ${founder.firstName}.`} tone="grey">
        <FounderNote name={founder.name} jobTitle={founder.jobTitle} place={founder.place} photo={ownerAgreed.founderPhoto}>
          <p>
            I live in {founder.place}. I’ve run a software company for years, and I built {brand.name} myself. I passed my driving test in January
            2025, after almost two weeks just finding an instructor, with every lesson arranged over calls, WhatsApp and bank transfers.
          </p>
          <p>My instructor had the same mess from the other side. So I asked: what if one thing sorted all of it?</p>
          <p>
            If you teach in {patch}, I’ll set it up with you in person. Anywhere else, book a free call below and we’ll do it on the phone. Either
            way, I do the typing.
          </p>
        </FounderNote>
      </Band>

      <Band
        id="onboarding-call"
        eyebrow="Set up with you"
        title="Book a free onboarding call"
        description="I’ll set up your account with you, import your learners and have your business ready in less than 30 minutes, on one free phone call. Pick a time that suits you, and I’ll ring you."
      >
        <BookingFacade url={brand.onboardingCall} embedDomain={brand.domain} title="Choose a time for your free onboarding call" />
        {/* Told where it is asked for, as the privacy notice says it (D-407). */}
        <p className="max-w-3xl text-small text-pretty text-grey-700">
          Booking passes your name, email address and mobile number to us through Calendly, so we can ring you.{' '}
          <a href="/privacy" className="font-semibold text-blue underline underline-offset-4">
            Our privacy notice
          </a>{' '}
          says what we do with them.
        </p>
        {ownerAgreed.whatsApp ? (
          <p className="text-body text-grey-700">
            Rather message first?{' '}
            <a href={whatsApp} className="font-semibold text-blue underline underline-offset-4">
              Message {founder.firstName} on WhatsApp
            </a>
          </p>
        ) : null}
      </Band>

      <Band id="questions" title="What instructors ask me" tone="grey">
        <QuestionAccordion questions={questions(open)} />
        <ActionRow
          id="action-questions"
          aside={
            <a href="#onboarding-call" className="font-semibold text-blue underline underline-offset-4">
              Still unsure? Book a free call
            </a>
          }
        >
          <SignUpLink href={signUp}>{action}</SignUpLink>
        </ActionRow>
      </Band>

      <div id="founding-places" className="pb-14 md:pb-20">
        <FoundingOffer
          places={places}
          action={<SignUpLink href={signUp}>{action}</SignUpLink>}
          note={`After the first ${String(foundingOffer.instructorLimit)}, it’s ${String(freeTrial.longDays)} days free for the next ${String(freeTrial.first)}.`}
        />
      </div>

      <ClosingCall
        id="claim"
        eyebrow={<SignalEyebrow lit="green">Your green light</SignalEyebrow>}
        title={open ? 'Claim your founding place.' : 'Start free today.'}
        description={
          open
            ? `Pro free for ${term}, for the first ${String(foundingOffer.instructorLimit)} instructors. Free to start, no card needed, and set up in about 10 minutes.`
            : 'Free to start, no card needed, and set up in about 10 minutes.'
        }
        action={
          <div className="flex w-full flex-col gap-3 md:w-auto md:items-end">
            <SignUpLink href={signUp} onDark>
              {action}
            </SignUpLink>
            {ownerAgreed.whatsApp ? (
              <Button
                asChild
                size="lg"
                width="responsive"
                variant="tertiary"
                className="text-white ring-1 ring-white/60 hover:bg-white/10 hover:no-underline"
              >
                <a href={whatsApp}>
                  <MessageCircle size={20} strokeWidth={2} aria-hidden />
                  Message {founder.firstName} on WhatsApp
                </a>
              </Button>
            ) : null}
          </div>
        }
      />

      <StickyAction
        href={signUp}
        after="opening-action"
        // Every part with buttons of its own, in page order, the closing call last.
        quietWhile={['action-film', 'action-old-way', 'action-fix', 'action-stories', 'action-fair', 'onboarding-call', 'action-questions', 'founding-places', 'claim']}
      >
        {action}
      </StickyAction>
    </>
  );
}
