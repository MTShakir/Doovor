import { brand } from '@repo/config/brand';
import { foundingOffer, plans, standardCardFee } from '@repo/config/plans';
import { formatPence } from '@repo/core/money';
import { siteShareCard } from '@repo/core/share-card';
import type { Metadata } from 'next';
import { Band, ClosingCall, FoundingOffer, PlanCard, PrimaryLink } from '@/components/site/marketing';
import { getAppUrl } from '@/lib/app-url';
import { publicPageMetadata } from '@/lib/public/metadata';
import { planSummaries } from '@/lib/site/plan-features';

/** Plans and prices (PRD 9.18, M5-09), every figure from `@repo/config/plans`. */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Pricing',
    description: `Free for independent driving instructors, Pro at ${formatPence(plans.pro.monthlyPricePence)} a month, and ${formatPence(plans.school.monthlyPricePence)} per instructor for schools. See what each plan includes on ${brand.name}.`,
    path: '/pricing',
    indexable: true,
    card: siteShareCard(brand.tagline),
    imagePath: '/',
  });
}

/** "1.5% plus 20p", as a card fee is said: the fixed part is always a few pence. */
function cardFeeWords(): string {
  return `${String(standardCardFee.basisPoints / 100)}% plus ${String(standardCardFee.fixedPence)}p`;
}

export default function PricingPage() {
  const appUrl = getAppUrl();
  const summaries = planSummaries();
  const questions = [
    {
      question: 'What does the founding offer include?',
      answer: `The paid plan for your business, free for ${String(foundingOffer.months)} months: Pro for independent instructors, and the School plan for driving schools. It is open to the first ${String(foundingOffer.instructorLimit)} instructors and the first ${String(foundingOffer.schoolLimit)} schools.`,
    },
    {
      question: 'Do learners pay anything to use it?',
      answer: 'No. Learners pay for their lessons, at the price their instructor sets, and nothing more.',
    },
    {
      question: 'Who holds the money?',
      answer: `Your business does. Card payments go to your own Stripe account, and packages of hours are credit with your business only. ${brand.name} never holds learners’ money.`,
    },
    {
      question: 'Can I record cash and bank transfers?',
      answer: 'Yes, on every plan, in two taps, and the learner’s balance updates straight away.',
    },
  ];
  return (
    <>
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-10 pb-10 md:px-6 md:pt-20">
        <h1 className="text-display text-balance text-black md:text-hero">Simple pricing</h1>
        <p className="max-w-2xl text-body text-pretty text-grey-700 md:text-h3 md:font-normal">
          Start free as an independent instructor. Add Pro for text reminders and more, or run your whole school on one plan.
        </p>
      </section>

      <FoundingOffer />

      <Band id="plans" title="Plans">
        <div className="grid gap-4 lg:grid-cols-3">
          {summaries.map((plan) => (
            <PlanCard key={plan.key} plan={plan} signUpUrl={`${appUrl}/sign-up?role=${plan.signUpRole}`} highlighted={plan.key === 'pro'} />
          ))}
        </div>
      </Band>

      <Band
        id="card-payments"
        title="Card payments"
        description={`Learners pay your business directly through Stripe. Stripe’s standard fee for a UK card, about ${cardFeeWords()}, comes out of each payment. ${brand.name} takes nothing from lessons with your own learners, and learners never pay extra for paying by card.`}
        tone="grey"
      >
        <p className="text-small text-grey-700">Fees for cards from outside the UK are set by Stripe and can be higher.</p>
      </Band>

      <Band id="questions" title="Questions">
        <dl className="grid gap-8 md:grid-cols-2">
          {questions.map(({ question, answer }) => (
            <div key={question} className="flex flex-col gap-2">
              <dt className="text-h3 text-black">{question}</dt>
              <dd className="text-body text-pretty text-grey-700">{answer}</dd>
            </div>
          ))}
        </dl>
      </Band>

      <ClosingCall
        title="Start free today"
        description="Create your account in minutes. No card needed."
        action={
          <PrimaryLink href={`${appUrl}/start`} onDark>
            Get started
          </PrimaryLink>
        }
      />
    </>
  );
}
