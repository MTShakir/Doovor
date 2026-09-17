import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import { CalendarRange, CreditCard, Gauge, KeyRound, ListChecks, Route, UserCog, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { GlimpseAlone, SchoolGlimpse } from '@/components/site/glimpses';
import { Band, ClosingCall, FeatureGrid, FoundingOffer, PageHero, PlanCard, PrimaryLink, SecondaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { planSummaries } from '@/lib/site/plan-features';

/** The page for driving schools (PRD 8.3, M5-09). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Driving school software: instructors, learners and payments',
    description: `Run your driving school in one place: every instructor’s diary, learner allocation, school prices and payments, with the week at a glance. On ${brand.name}.`,
    path: '/driving-schools-software',
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

const features = [
  {
    icon: Gauge,
    title: 'The week at a glance',
    description: 'Lessons today and this week, revenue this month, what is unpaid, how busy each instructor is, and new learners.',
  },
  {
    icon: CalendarRange,
    title: 'Every diary side by side',
    description: 'See all your instructors’ days together, filtered by instructor or by manual and automatic.',
  },
  {
    icon: Users,
    title: 'Your instructors',
    description: 'Invite instructors by email or text, choose what each can do, and turn off access for somebody who leaves.',
  },
  {
    icon: Route,
    title: 'The right instructor for each learner',
    description: 'Assign learners yourself, or take a suggestion by area, transmission and free time, with the reasons shown.',
  },
  {
    icon: ListChecks,
    title: 'One set of prices and rules',
    description: 'School prices, packages, a cancellation policy and booking rules for everyone, with exceptions where you allow them.',
  },
  {
    icon: CreditCard,
    title: 'Payments to the school',
    description: 'Learners pay the school by card, with packages of hours or in person, and every receipt carries the school’s name.',
  },
  {
    icon: UserCog,
    title: 'Managers without the money',
    description: 'Office staff run instructors, learners and bookings without seeing payouts or billing.',
  },
  {
    icon: KeyRound,
    title: 'Two-step sign-in for owners',
    description: 'The owner’s account is protected by a code from an authenticator app, as well as a password.',
  },
] as const;

export default function DrivingSchoolsSoftwarePage() {
  const appUrl = getAppUrl();
  const signUp = `${appUrl}/sign-up?role=school`;
  const school = planSummaries().find((plan) => plan.key === 'school');
  return (
    <>
      <PageHero
        eyebrow="For driving schools"
        title="Your whole driving school in one place"
        description="Every instructor’s diary, your learners, prices and payments, with an overview that shows how the week is going."
        actions={
          <>
            <PrimaryLink href={signUp}>Set up your school</PrimaryLink>
            <SecondaryLink href="/pricing">See pricing</SecondaryLink>
          </>
        }
        visual={
          <GlimpseAlone>
            <SchoolGlimpse />
          </GlimpseAlone>
        }
      />

      <Band id="school-features" title="Run the school, not the spreadsheets" tone="grey">
        <FeatureGrid features={features} tone="grey" />
      </Band>

      <FoundingOffer />

      {school ? (
        <Band id="school-plan" title="One price for each instructor" description="Priced by the size of your team, with everything in Pro for every instructor.">
          <div className="max-w-md">
            <PlanCard plan={school} signUpUrl={signUp} highlighted />
          </div>
        </Band>
      ) : null}

      <ClosingCall
        title="Bring your team across this week"
        description="Set up the school, invite your instructors, and bring your learners in from a spreadsheet."
        action={
          <PrimaryLink href={signUp} onDark>
            Set up your school
          </PrimaryLink>
        }
      />
    </>
  );
}
