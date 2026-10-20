import { brand } from '@repo/config/brand';
import { siteShareCard } from '@repo/core/share-card';
import {
  ArrowLeftRight,
  Award,
  BadgeCheck,
  Bell,
  Briefcase,
  CalendarRange,
  CreditCard,
  FileSpreadsheet,
  Gauge,
  Inbox,
  KeyRound,
  ListChecks,
  PoundSterling,
  ReceiptPoundSterling,
  Route,
  Tag,
  UserCog,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import { GlimpseAlone, SchoolGlimpse } from '@/components/site/glimpses';
import { Band, ClosingCall, FeatureGrid, FoundingOffer, PageHero, PlanCard, PrimaryLink, SecondaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { foundingPlaces } from '@/lib/site/founding';
import { foundingPrice, planSummaries } from '@/lib/site/plan-features';

/** The page for driving schools (PRD 8.3, M5-09), with what M9 built for them (D-308). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Driving school software: instructors, learners and payments',
    description: `Run your driving school in one place: instructors under the school or with their own business, learners, prices, fees and pay, with the week at a glance. On ${brand.name}.`,
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
    icon: FileSpreadsheet,
    title: 'Learners from a spreadsheet',
    description: 'Add learners yourself or import them from a spreadsheet, then choose who teaches each one.',
  },
  {
    icon: ListChecks,
    title: 'One set of prices and rules',
    description: 'School prices, packages, a cancellation policy and booking rules for everyone, with exceptions where you allow them.',
  },
  {
    icon: CreditCard,
    title: 'Who sells the lessons',
    description:
      'Say whether the school sells every lesson, your instructors sell their own, or both. Learners pay whoever sells it, by card, with packages of hours or in person, and each receipt carries the seller’s name.',
  },
  {
    icon: PoundSterling,
    title: 'Instructor pay, worked out',
    description:
      'Set an hourly rate or a share of each lesson for each instructor who teaches under the school, and see their lessons, hours and pay each week, with a spreadsheet to download.',
  },
  {
    icon: BadgeCheck,
    title: 'Badges you vouch for',
    description:
      'Your instructors go live without waiting for us to check their badge, because the school vouches for them. Once they add its expiry date, they are reminded before it runs out.',
  },
  {
    icon: Bell,
    title: 'Told as things happen',
    description: 'The office hears when a learner joins or moves to you, when a pupil is taken, and when a linked instructor leaves.',
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

/** Instructors who keep a business of their own and work with the school (M9-05 to M9-24). */
const linkedFeatures = [
  {
    icon: Briefcase,
    title: 'They keep their business',
    description:
      'Their learners, prices, payments and Stripe account stay theirs. You see when they are free, never their money or their learners’ details.',
  },
  {
    icon: Tag,
    title: 'Prices you recommend',
    description: 'Suggest a price for each lesson and set the most they can charge. They set their own prices within it.',
  },
  {
    icon: ReceiptPoundSterling,
    title: 'Fees on your terms',
    description: 'A weekly or monthly fee, free weeks to start, and a fee for each pupil you introduce. You both see one statement, and you mark each fee paid.',
  },
  {
    icon: Inbox,
    title: 'New pupils from your page',
    description:
      'People ask for lessons on your school’s page. Offer each one to your linked instructors, and the first to accept takes them, or give them to one of your own.',
  },
  {
    icon: Award,
    title: 'Pro while they are linked',
    description: 'A linked instructor has everything in Pro for as long as they are linked, counted as one of your instructors.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Moving is the learner’s choice',
    description:
      'When an instructor joins you from their own business, their learners choose whether to follow. When a linked one leaves, the pupils you introduced choose whether to come back, and you are told.',
  },
] as const;

export default async function DrivingSchoolsSoftwarePage() {
  const appUrl = getAppUrl();
  const places = await foundingPlaces();
  const signUp = `${appUrl}/sign-up?role=school`;
  const school = planSummaries().find((plan) => plan.key === 'school');
  return (
    <>
      <PageHero
        eyebrow="For driving schools"
        title="Your whole driving school in one place"
        description="Every instructor’s diary, your learners, prices and payments, with an overview that shows how the week is going. Your instructors can teach under the school or keep their own business."
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

      <Band
        id="linked-instructors"
        title="Instructors with their own business"
        description="Link the instructors who sell their own lessons, and send them pupils on terms you set."
      >
        <FeatureGrid features={linkedFeatures} />
      </Band>

      <FoundingOffer places={places} audience="schools" />

      {school ? (
        <Band
          id="school-plan"
          title="One plan for the whole school"
          description="A fee for the school and one for each instructor, linked instructors included, with everything in Pro for each of them."
        >
          <div className="max-w-md">
            <PlanCard plan={school} signUpUrl={signUp} highlighted founding={foundingPrice(school, places)} />
          </div>
        </Band>
      ) : null}

      <ClosingCall
        title="Bring your team across this week"
        description="Set up the school, invite your instructors or link the ones with their own business, and bring your learners in from a spreadsheet."
        action={
          <PrimaryLink href={signUp} onDark>
            Set up your school
          </PrimaryLink>
        }
      />
    </>
  );
}
