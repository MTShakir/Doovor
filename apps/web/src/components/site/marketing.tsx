import { foundingOffer } from '@repo/config/plans';
import { foundingCountWords, foundingTermWords } from '@repo/core/founding';
import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { ProgressBar } from '@repo/ui/progress';
import { cn } from '@repo/ui/lib/cn';
import { Check, ChevronDown, Clock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FoundingPlaces } from '@/lib/site/founding';
import type { FoundingPrice, PlanSummary } from '@/lib/site/plan-features';

/**
 * The pieces the site's own pages are made of (PRD 8.3, M5-09), in the product's own look: white,
 * black type, one black button that matters, and yellow only where something deserves the eye.
 */

export function PageHero({
  eyebrow,
  badge,
  title,
  description,
  actions,
  note,
  visual,
}: {
  eyebrow?: string;
  /** Above the title, for the one thing worth seeing first: the founding offer while it lasts. */
  badge?: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
  /** Under the buttons: what somebody wonders before pressing one, answered in a line. */
  note?: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <section className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-12 px-4 pt-10 pb-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:px-6 md:pt-20 md:pb-24">
      <div className="flex flex-col gap-5">
        {badge}
        {eyebrow ? <p className="text-small font-semibold text-grey-700">{eyebrow}</p> : null}
        <h1 className="text-display text-balance text-black md:text-hero">{title}</h1>
        <p className="max-w-xl text-body text-pretty text-grey-700 md:text-h3 md:font-normal">{description}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">{actions}</div>
        {note === undefined ? null : <div className="text-small text-grey-700">{note}</div>}
      </div>
      {visual ? <div className="flex justify-center md:justify-end">{visual}</div> : null}
    </section>
  );
}

/**
 * The founding offer as a line above a page's title (D-251): how long the paid plan is free and,
 * from the database's own count, how many places are left. Nothing at all once they have gone.
 */
export function FoundingBadge({ places, audience = 'instructors' }: { places: FoundingPlaces | null; audience?: 'instructors' | 'schools' }) {
  const counted = places?.[audience] ?? null;
  if (counted?.full === true) return null;
  const plan = audience === 'schools' ? 'The School plan' : 'Pro';
  const term = foundingTermWords(places?.months ?? foundingOffer.months);
  return (
    <p className="flex w-fit flex-wrap items-center gap-x-2 rounded-card bg-yellow px-4 py-2 text-small font-semibold text-black">
      <span>Founding offer: {plan} free for {term}</span>
      {counted === null ? null : <span className="font-normal tabular-nums">{foundingCountWords(counted).detail}</span>}
    </p>
  );
}

/**
 * The traffic light the brand's story moves through (D-404): red is the old way, red and amber the
 * moment before it changes, and green the product. The one place red and green are used as colour
 * rather than as a payment's state. It repeats the words beside it, so it is hidden from readers.
 */
export type Signal = 'red' | 'red-and-amber' | 'green';

export function TrafficLight({ lit }: { lit: Signal }) {
  const lamps = [
    { colour: 'bg-red', on: lit !== 'green' },
    { colour: 'bg-yellow', on: lit === 'red-and-amber' },
    { colour: 'bg-green', on: lit === 'green' },
  ];
  return (
    <span aria-hidden className="inline-flex h-7 w-3.5 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full bg-black">
      {lamps.map(({ colour, on }) => (
        <span key={colour} className={cn('size-1.5 rounded-full', on ? colour : 'bg-grey-700')} />
      ))}
    </span>
  );
}

/** A section's small first line, beside the light that says where in the story it is. */
export function SignalEyebrow({ lit, children }: { lit: Signal; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <TrafficLight lit={lit} />
      {children}
    </span>
  );
}

/** One thing the product does, told in a few points beside a glimpse of it, alternating sides. */
export function FeatureStory({
  id,
  eyebrow,
  title,
  description,
  points,
  visual,
  flip = false,
  tone = 'white',
  action,
}: {
  id: string;
  eyebrow: ReactNode;
  title: string;
  description: string;
  /** What it does, each in a line. Those on Pro say so, rather than being sold as on every plan. */
  points: readonly { text: string; pro?: boolean }[];
  visual: ReactNode;
  /** A button under the points, for a page that asks again as it goes (D-406). */
  action?: ReactNode;
  /** The glimpse on the left, so a page of these does not read as one long column. */
  flip?: boolean;
  tone?: 'white' | 'grey';
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={tone === 'grey' ? 'bg-grey-100' : 'bg-white'}>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-6 md:py-20">
        <div className={cn('flex flex-col gap-4', flip && 'md:order-2')}>
          <p className="text-small font-semibold text-grey-700">{eyebrow}</p>
          <h2 id={`${id}-heading`} className="text-h1 text-balance text-black">
            {title}
          </h2>
          <p className="text-body text-pretty text-grey-700">{description}</p>
          <ul className="mt-2 flex flex-col gap-3">
            {points.map((point) => (
              <li key={point.text} className="flex gap-3 text-body text-ink">
                <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-black" aria-hidden />
                <span>
                  {point.text}
                  {point.pro ? (
                    <span className="ml-2 inline-flex rounded-full bg-yellow-100 px-2 align-middle text-caption font-semibold text-black">On Pro</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {action === undefined ? null : <div className="mt-4">{action}</div>}
        </div>
        <div className={cn('flex justify-center', flip ? 'md:order-1 md:justify-start' : 'md:justify-end')}>{visual}</div>
      </div>
    </section>
  );
}

/** Questions somebody asks before signing up, each with its answer. */
export function QuestionList({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2">
      {questions.map(({ question, answer }) => (
        <div key={question} className="flex flex-col gap-2">
          <dt className="text-h3 text-black">{question}</dt>
          <dd className="text-body text-pretty text-grey-700">{answer}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The same questions, each opening onto its answer, for a page read on a phone with a minute to
 * spare: the list is short enough to find the one that is somebody's own (D-404). A disclosure the
 * browser draws, so it opens before the page has loaded anything else, or with no script at all.
 */
export function QuestionAccordion({ questions }: { questions: readonly { question: string; answer: string }[] }) {
  return (
    <div className="flex flex-col divide-y divide-grey-200 border-y border-grey-200">
      {questions.map(({ question, answer }) => (
        <details key={question} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-h3 text-black [&::-webkit-details-marker]:hidden">
            {question}
            <ChevronDown size={20} strokeWidth={2} className="shrink-0 transition-transform duration-200 ease-out group-open:rotate-180" aria-hidden />
          </summary>
          <p className="max-w-3xl pb-5 text-body text-pretty text-grey-700">{answer}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * A band of the page, with a heading of its own. Grey bands separate what sits either side. Its id
 * is what a link to it goes to, as "Find an instructor" and "See pricing" do (D-364).
 */
export function Band({
  id,
  eyebrow,
  title,
  description,
  tone = 'white',
  children,
}: {
  id: string;
  /** A small line over the heading: where in the page's story this band is (D-404). */
  eyebrow?: ReactNode;
  title: string;
  description?: string;
  tone?: 'white' | 'grey';
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={tone === 'grey' ? 'bg-grey-100' : 'bg-white'}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 md:px-6 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
          {eyebrow === undefined ? null : <p className="text-small font-semibold text-grey-700">{eyebrow}</p>}
          <h2 id={`${id}-heading`} className="text-h1 text-balance text-black">
            {title}
          </h2>
          {description ? <p className="text-body text-pretty text-grey-700">{description}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureGrid({ features, tone = 'white' }: { features: readonly Feature[]; tone?: 'white' | 'grey' }) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {features.map(({ icon: Icon, title, description }) => (
        <li key={title} className="flex flex-col gap-3">
          <span className={cn('flex size-12 items-center justify-center rounded-full text-black', tone === 'grey' ? 'bg-white' : 'bg-grey-100')} aria-hidden>
            <Icon size={24} strokeWidth={1.5} />
          </span>
          <h3 className="text-h3 text-black">{title}</h3>
          <p className="text-body text-pretty text-grey-700">{description}</p>
        </li>
      ))}
    </ul>
  );
}

/** Columns on a wide screen, one for each step: three steps do not sit in the room for five. */
const stepColumns: Record<number, string> = { 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

/** Steps that happen in this order, and only then numbered. */
export function Steps({ steps }: { steps: readonly { title: string; description: string }[] }) {
  return (
    <ol className={cn('grid grid-cols-[minmax(0,1fr)] gap-6', stepColumns[steps.length] ?? 'md:grid-cols-5')}>
      {steps.map((step, index) => (
        <li key={step.title} className="flex flex-col gap-2 border-t-2 border-black pt-4">
          <span className="text-small font-semibold text-grey-700 tabular-nums">Step {index + 1}</span>
          <h3 className="text-h3 text-black">{step.title}</h3>
          <p className="text-small text-grey-700">{step.description}</p>
        </li>
      ))}
    </ol>
  );
}

/** The founding offer (PRD 9.18, D-027): the one thing on the site drawn in yellow. */
/**
 * The founding offer, with how many of the places have gone when that is known (D-203, D-243).
 *
 * The count is read from the database, from the same rows the places are given out from, so it is
 * true by construction: a number on a public page about how scarce something is has to be, and a
 * fixed one would stop being true the day it was typed. When it cannot be read the band says what
 * it said before there was a count, rather than guessing.
 *
 * It counts the places of whoever the page is talking to: the instructors' everywhere, as theirs
 * run out first, and the schools' on the page for driving schools. Once every one of those has
 * gone the band stops offering one and says what a new business gets instead, which is a free
 * trial: an offer still printed after it has closed is the other way for this number to lie. The
 * page chooses the button's words, since it knows where it leads.
 */
export function FoundingOffer({
  id = 'founding-offer',
  action,
  places,
  audience = 'instructors',
  note,
}: {
  /** Named for its heading, so a page that shows it twice, as the design page does, names each. */
  id?: string;
  action?: ReactNode;
  places?: FoundingPlaces | null;
  audience?: 'instructors' | 'schools';
  /** A last line while the places are open: what anybody who misses one gets instead (D-404). */
  note?: string;
}) {
  const counted = places?.[audience] ?? null;
  const closed = counted?.full === true;
  const months = places?.months ?? foundingOffer.months;
  const count = counted === null ? null : foundingCountWords(counted);

  return (
    <section aria-labelledby={`${id}-heading`} className="mx-auto w-full max-w-6xl px-4 md:px-6">
      <div className="flex flex-col gap-6 rounded-card bg-yellow p-6 text-black md:flex-row md:items-center md:justify-between md:gap-10 md:p-10">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-small font-semibold">Founding offer</p>
          <h2 id={`${id}-heading`} className="text-h1 text-balance">
            {closed ? 'Start on the paid plan, free' : `The paid plan free for ${foundingTermWords(months)}`}
          </h2>
          <p className="text-body">
            {closed
              ? // No number of days: the trial is 90 days for the next 500 and 30 after, and a figure
                // here would be the next thing on this page to stop being true (D-204).
                'The founding places have all gone. Every new business still starts on the paid plan free for a while, with no card needed.'
              : `Pro for the first ${String(foundingOffer.instructorLimit)} independent instructors, and the School plan for the first ${String(foundingOffer.schoolLimit)} driving schools. No card needed.`}
          </p>
          {closed || note === undefined ? null : <p className="text-body font-semibold">{note}</p>}
          {count === null || counted === null ? null : (
            <div className="mt-3 flex max-w-md flex-col gap-2" data-testid="founding-count">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-h2 font-semibold tabular-nums">{count.headline}</span>
                <span className="text-small font-semibold tabular-nums">{count.detail}</span>
              </div>
              <ProgressBar
                value={counted.percent}
                label={`Founding places taken: ${String(counted.taken)} of ${String(counted.limit)}`}
                // Black on a tint of black, because grey on the brand yellow does not read.
                className="h-3 bg-black/15"
              />
            </div>
          )}
        </div>
        {/* Its natural width, so the counter beside it cannot squeeze it onto two lines. */}
        {action === undefined ? null : <div className="shrink-0">{action}</div>}
      </div>
    </section>
  );
}

/** The last word on a page: what to do next, on black. */
export function ClosingCall({
  id,
  eyebrow,
  title,
  description,
  action,
}: {
  /** For a link to it, or something on the page that keeps out of its way (D-404). */
  id?: string;
  eyebrow?: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  const headingId = `${id ?? 'closing'}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className="bg-black text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-6 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
          {eyebrow === undefined ? null : <p className="text-small font-semibold">{eyebrow}</p>}
          <h2 id={headingId} className="text-h1 text-balance">
            {title}
          </h2>
          <p className="text-body text-pretty">{description}</p>
        </div>
        {action}
      </div>
    </section>
  );
}

/** A link styled as the page's one primary button. */
export function PrimaryLink({
  href,
  children,
  onDark = false,
  highlight = false,
}: {
  href: string;
  children: ReactNode;
  onDark?: boolean;
  /** In the brand yellow, on a black band whose button should be the brightest thing on it (D-410). */
  highlight?: boolean;
}) {
  return (
    <Button asChild size="lg" width="responsive" variant={highlight ? 'highlight' : onDark ? 'secondary' : 'primary'}>
      <a href={href}>{children}</a>
    </Button>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild size="lg" width="responsive" variant="secondary">
      <a href={href}>{children}</a>
    </Button>
  );
}

/**
 * One plan, with its price from the configuration, what it has today and what it will have. While
 * its founding places last, a paid plan shows £0 beside its own price struck through, how long it
 * is free for and what it costs after (D-251): see foundingPrice for why the comparison is true.
 */
export function PlanCard({
  plan,
  signUpUrl,
  highlighted = false,
  founding = null,
  idPrefix = 'plan',
}: {
  plan: PlanSummary;
  signUpUrl: string;
  highlighted?: boolean;
  founding?: FoundingPrice | null;
  /** For a page that shows the same plan twice, as the design page does. */
  idPrefix?: string;
}) {
  return (
    <article
      aria-labelledby={`${idPrefix}-${plan.key}`}
      className={cn('flex flex-col gap-6 rounded-card bg-white p-6', highlighted ? 'border-2 border-black' : 'border border-grey-200')}
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${idPrefix}-${plan.key}`} className="text-h2 text-black">
          {plan.name}
        </h3>
        <p className="text-small text-grey-700">{plan.audience}</p>
      </div>
      {founding === null ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-display text-black tabular-nums">{plan.price}</span>
          <span className="text-small text-grey-700">{plan.cadence}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid={`founding-price-${plan.key}`}>
          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-display text-black tabular-nums">{formatPence(0)}</span>
            {/* A struck price is not read out as struck, so it says what it is in words. */}
            <s className="text-h2 font-semibold text-grey-700 tabular-nums decoration-2">
              <span className="sr-only">Usually </span>
              {founding.usual}
            </s>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small">
            <span className="rounded-full bg-yellow px-3 py-1 font-semibold text-black">{founding.free}</span>
            <span className="text-grey-700">{founding.then}</span>
          </p>
          <p className="text-small font-semibold text-black">Founding offer: {founding.left}. No card needed.</p>
        </div>
      )}
      <ul aria-label={`In ${plan.name}`} className="flex flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-body text-ink">
            <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0 text-black" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
      {plan.later.length === 0 ? null : (
        <div className="flex flex-col gap-3 border-t border-grey-200 pt-4">
          <p className="text-small font-semibold text-grey-700">Coming later</p>
          <ul aria-label={`Coming later to ${plan.name}`} className="flex flex-col gap-3">
            {plan.later.map((feature) => (
              <li key={feature} className="flex gap-3 text-small text-grey-700">
                <Clock size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto pt-2">
        <Button asChild width="full" variant={highlighted ? 'primary' : 'secondary'}>
          <a href={signUpUrl} aria-label={`${plan.signUpRole === 'school' ? 'Set up your school' : 'Create your account'} on ${plan.name}`}>
            {plan.signUpRole === 'school' ? 'Set up your school' : 'Create your account'}
          </a>
        </Button>
      </div>
    </article>
  );
}
