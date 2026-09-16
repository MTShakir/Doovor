import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import { BadgeCheck, CalendarDays, ClipboardCheck, CreditCard, PiggyBank, QrCode, ShieldCheck, Users, WifiOff } from 'lucide-react';
import type { Metadata } from 'next';
import { GlimpsePair, MoneyGlimpse, TodayGlimpse } from '@/components/site/glimpses';
import { Band, ClosingCall, FeatureGrid, FoundingOffer, PageHero, PlanCard, PrimaryLink, SecondaryLink, Steps } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { planSummaries } from '@/lib/site/plan-features';

/** The page for driving instructors (PRD 8.3, M5-09). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Driving instructor software: diary, payments and lesson records',
    description: `Run your driving lessons from your phone: a diary, learners, card and cash payments, lesson records and your own booking link. Free to start on ${brand.name}.`,
    path: '/instructors-software',
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

const features = [
  {
    icon: CalendarDays,
    title: 'A diary that never double books',
    description: 'Day, week and month views, time between lessons kept free, and weekly lessons that book themselves.',
  },
  {
    icon: Users,
    title: 'Your learners in one list',
    description: 'Contact details, pickup points and notes only you can see. Invite learners by WhatsApp, text or email, or bring them in from a spreadsheet.',
  },
  {
    icon: CreditCard,
    title: 'Get paid on time',
    description: 'Card payments go straight to your business. Sell packages of hours, record cash in two taps, and on Pro, charge a saved card the day before.',
  },
  {
    icon: ShieldCheck,
    title: 'Cancellations handled for you',
    description: 'Your cancellation policy is applied on its own, with late cancellation and no-show fees taken the way you set.',
  },
  {
    icon: ClipboardCheck,
    title: 'Lesson records in under a minute',
    description: 'Tap the skills you covered, rate each one from 1 to 5 and add a line. Your learner sees their progress straight away.',
  },
  {
    icon: QrCode,
    title: 'Your profile and booking link',
    description: 'A public profile with your prices and free times, and a booking link with a QR code to share on WhatsApp and Instagram.',
  },
  {
    icon: BadgeCheck,
    title: 'The blue tick',
    description: 'Upload a photo of your badge. When we have checked it, your profile shows the Verified tick learners look for.',
  },
  {
    icon: WifiOff,
    title: 'Works without signal',
    description: 'Today’s lessons and your lesson records work offline in a car park, and catch up when you are back online.',
  },
  {
    icon: PiggyBank,
    title: 'Money at a glance',
    description: 'What came in this week, this month and this tax year, what is still owed, and a receipt sent for every payment.',
  },
] as const;

const steps = [
  { title: 'Your name and photo', description: 'How learners will see you.' },
  { title: 'Your badge', description: 'Your ADI or PDI number and a photo of your badge.' },
  { title: 'Where you teach', description: 'Your base postcode and how far you travel.' },
  { title: 'Your prices', description: 'An hourly price, and a package if you sell one.' },
  { title: 'Your hours', description: 'The times you usually teach each week.' },
] as const;

export default function InstructorsSoftwarePage() {
  const appUrl = getAppUrl();
  const signUp = `${appUrl}/sign-up?role=instructor`;
  const [free, pro] = planSummaries();
  return (
    <>
      <PageHero
        eyebrow="For driving instructors"
        title="Run your driving lessons from your phone"
        description="Your diary, learners, payments and lesson records in one simple app. Free to start, with your own profile and booking link."
        actions={
          <>
            <PrimaryLink href={signUp}>Create your free account</PrimaryLink>
            <SecondaryLink href="/pricing">See pricing</SecondaryLink>
          </>
        }
        visual={<GlimpsePair back={<TodayGlimpse />} front={<MoneyGlimpse />} />}
      />

      <Band id="instructor-features" title="Less admin, more lessons" description="Everything you do around a lesson, done in fewer taps." tone="grey">
        <FeatureGrid features={features} tone="grey" />
      </Band>

      <Band id="set-up" title="Set up in five short steps" description="Skip any step but the first, and come back to it when you like.">
        <Steps steps={steps} />
      </Band>

      <FoundingOffer />

      {free && pro ? (
        <Band id="instructor-plans" title="Start free, add Pro when you want it">
          <div className="grid gap-4 md:grid-cols-2">
            <PlanCard plan={free} signUpUrl={signUp} />
            <PlanCard plan={pro} signUpUrl={signUp} highlighted />
          </div>
        </Band>
      ) : null}

      <ClosingCall
        title="Your first lesson booked today"
        description="Create your account, add a learner by WhatsApp, and book them in three taps."
        action={
          <PrimaryLink href={signUp} onDark>
            Create your free account
          </PrimaryLink>
        }
      />
    </>
  );
}
