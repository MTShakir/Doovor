import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import { BadgeCheck, BellRing, Building2, CalendarCheck, CarFront, ClipboardCheck, CreditCard, GraduationCap, WifiOff } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { BookingGlimpse, GlimpsePair, TodayGlimpse } from '@/components/site/glimpses';
import { Band, ClosingCall, FeatureGrid, FoundingOffer, PageHero, PrimaryLink, SecondaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { launchCities } from '@/lib/site/cities';

/** The site's front door (PRD 8.3, M5-09). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: `${brand.name}: book, pay and track driving lessons`,
    description: `${brand.tagline} For learners, driving instructors and driving schools across the UK.`,
    path: '/',
    indexable: true,
    absoluteTitle: true,
    card: siteShareCard(brand.tagline),
  });
}

const audiences: { href: Route; icon: typeof GraduationCap; title: string; description: string; link: string }[] = [
  {
    href: '/learners',
    icon: GraduationCap,
    title: 'Learning to drive',
    description: 'Book lessons with your instructor, pay in the app and see how you are doing after every lesson.',
    link: 'For learners',
  },
  {
    href: '/instructors-software',
    icon: CarFront,
    title: 'Driving instructors',
    description: 'Your diary, learners, payments and lesson records, on your phone, with your own booking link.',
    link: 'For instructors',
  },
  {
    href: '/driving-schools-software',
    icon: Building2,
    title: 'Driving schools',
    description: 'Every instructor’s diary, your learners and your money in one place, with the week at a glance.',
    link: 'For driving schools',
  },
];

const features = [
  {
    icon: CalendarCheck,
    title: 'Booked in under a minute',
    description: 'A learner picks a lesson and a free time from their instructor’s link, and pays. Nothing is ever booked twice.',
  },
  {
    icon: CreditCard,
    title: 'Paid, not chased',
    description: 'Cards, Apple Pay and Google Pay, packages of hours, and cash or bank transfers recorded in two taps.',
  },
  {
    icon: ClipboardCheck,
    title: 'Progress on the test’s own terms',
    description: 'After each lesson the instructor rates the areas of the driving test report, and the learner sees it.',
  },
  {
    icon: BadgeCheck,
    title: 'Instructors checked by us',
    description: 'A blue tick on a profile means we have checked the instructor’s badge ourselves.',
  },
  {
    icon: BellRing,
    title: 'Reminders before every lesson',
    description: 'Learners are reminded the day before and two hours before each lesson.',
  },
  {
    icon: WifiOff,
    title: 'Works without signal',
    description: 'An instructor’s day and lesson records work offline, and catch up when the signal is back.',
  },
] as const;

export default async function HomePage() {
  const appUrl = getAppUrl();
  const cities = await launchCities();
  return (
    <>
      <PageHero
        title="Driving lessons, sorted."
        description={`${brand.tagline} For learners, driving instructors and driving schools.`}
        actions={
          <>
            <PrimaryLink href={`${appUrl}/start`}>Get started</PrimaryLink>
            <SecondaryLink href="/pricing">See pricing</SecondaryLink>
          </>
        }
        visual={<GlimpsePair back={<TodayGlimpse />} front={<BookingGlimpse />} />}
      />

      <Band id="audiences" title="One app for everybody in a driving lesson" tone="grey">
        <ul className="grid gap-4 md:grid-cols-3">
          {audiences.map(({ href, icon: Icon, title, description, link }) => (
            <li key={href}>
              <Link href={href} className="group flex h-full flex-col gap-3 rounded-card border border-grey-200 bg-white p-6 hover:border-black">
                <span className="flex size-12 items-center justify-center rounded-full bg-grey-100 text-black" aria-hidden>
                  <Icon size={24} strokeWidth={1.5} />
                </span>
                <h3 className="text-h3 text-black">{title}</h3>
                <p className="flex-1 text-body text-grey-700">{description}</p>
                <span className="text-body font-semibold text-black underline-offset-4 group-hover:underline">{link}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band id="features" title="Built for how driving lessons really work">
        <FeatureGrid features={features} />
      </Band>

      <FoundingOffer action={<PrimaryLink href={`${appUrl}/start`}>Claim the offer</PrimaryLink>} />

      {cities.length === 0 ? null : (
        <Band id="cities" title="Instructors near you" description="Every instructor listed is checked by us, with their prices and free times.">
          <ul className="flex flex-wrap gap-2">
            {cities.map((city) => (
              <li key={city.slug}>
                <a
                  href={`/driving-lessons/${city.slug}`}
                  className="inline-flex min-h-12 items-center rounded-full border border-grey-200 px-5 text-body font-semibold text-black hover:border-black"
                >
                  Driving lessons in {city.name}
                </a>
              </li>
            ))}
          </ul>
        </Band>
      )}

      <ClosingCall
        title="Start in minutes"
        description="Create an account, tell us who you are, and you are ready to book, teach or run your school."
        action={
          <PrimaryLink href={`${appUrl}/start`} onDark>
            Get started
          </PrimaryLink>
        }
      />
    </>
  );
}
