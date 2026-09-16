import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import { BellRing, CalendarCheck, CalendarX2, ClipboardCheck, CreditCard, Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { BookingGlimpse, GlimpsePair, ProgressGlimpse } from '@/components/site/glimpses';
import { Band, ClosingCall, FeatureGrid, PageHero, PrimaryLink, SecondaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { launchCities } from '@/lib/site/cities';

/** The page for learners (PRD 8.3, M5-09). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Driving lessons for learners: book, pay and see your progress',
    description: `Book lessons with your driving instructor, pay in the app and see your progress after every lesson, on ${brand.name}.`,
    path: '/learners',
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

const features = [
  {
    icon: CalendarCheck,
    title: 'Book from your instructor’s link',
    description: 'Choose a lesson and a free time, and it is booked. No messages back and forth to find a slot.',
  },
  {
    icon: CreditCard,
    title: 'Pay the way you like',
    description: 'Pay by card, Apple Pay or Google Pay, or buy a package of hours and your lessons come out of it.',
  },
  {
    icon: ClipboardCheck,
    title: 'Know how you are doing',
    description: 'After each lesson your instructor records what you covered, on the same areas as the driving test report.',
  },
  {
    icon: BellRing,
    title: 'Never miss a lesson',
    description: 'A reminder the day before and two hours before, by email and on your phone.',
  },
  {
    icon: CalendarX2,
    title: 'Plans change',
    description: 'Move or cancel a lesson in the app. Your instructor’s cancellation policy is shown before you book.',
  },
  {
    icon: Layers,
    title: 'Your progress in one place',
    description: 'Learning with more than one instructor? Your lesson records from each of them sit together.',
  },
] as const;

export default async function LearnersPage() {
  const appUrl = getAppUrl();
  const cities = await launchCities();
  return (
    <>
      <PageHero
        eyebrow="For learners"
        title="Learn to drive, without the admin"
        description="Book lessons with your instructor, pay in the app, and see your progress after every lesson."
        actions={
          <>
            <PrimaryLink href={`${appUrl}/sign-up?role=learner`}>Create a learner account</PrimaryLink>
            {cities.length === 0 ? null : <SecondaryLink href="#instructors-near-you">Find instructors</SecondaryLink>}
          </>
        }
        visual={<GlimpsePair back={<ProgressGlimpse />} front={<BookingGlimpse />} />}
      />

      <Band id="learner-features" title="Everything about your lessons, in your pocket" tone="grey">
        <FeatureGrid features={features} tone="grey" />
      </Band>

      {cities.length === 0 ? null : (
        <Band
          id="instructors-near-you"
          title="Instructors near you"
          description="Searching for an instructor with space near your postcode is coming soon. Until then, see the instructors we have checked in these cities, with their prices and free times."
        >
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
        title="Has your instructor sent you a link?"
        description="Open it to see their free times and book. Or create your account now, and your instructor can add you."
        action={
          <PrimaryLink href={`${appUrl}/sign-up?role=learner`} onDark>
            Create a learner account
          </PrimaryLink>
        }
      />
    </>
  );
}
