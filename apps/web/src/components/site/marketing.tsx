import { foundingOffer } from '@repo/config/plans';
import { Button } from '@repo/ui/button';
import { cn } from '@repo/ui/lib/cn';
import { Check, Clock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PlanSummary } from '@/lib/site/plan-features';

/**
 * The pieces the site's own pages are made of (PRD 8.3, M5-09), in the product's own look: white,
 * black type, one black button that matters, and yellow only where something deserves the eye.
 */

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  visual,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions: ReactNode;
  visual?: ReactNode;
}) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-10 pb-14 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:px-6 md:pt-20 md:pb-24">
      <div className="flex flex-col gap-5">
        {eyebrow ? <p className="text-small font-semibold text-grey-700">{eyebrow}</p> : null}
        <h1 className="text-display text-balance text-black md:text-hero">{title}</h1>
        <p className="max-w-xl text-body text-pretty text-grey-700 md:text-h3 md:font-normal">{description}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">{actions}</div>
      </div>
      {visual ? <div className="flex justify-center md:justify-end">{visual}</div> : null}
    </section>
  );
}

/** A band of the page, with a heading of its own. Grey bands separate what sits either side. */
export function Band({
  id,
  title,
  description,
  tone = 'white',
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone?: 'white' | 'grey';
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={tone === 'grey' ? 'bg-grey-100' : 'bg-white'}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-14 md:px-6 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
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
    <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
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

/** Steps that happen in this order, and only then numbered. */
export function Steps({ steps }: { steps: readonly { title: string; description: string }[] }) {
  return (
    <ol className="grid gap-6 md:grid-cols-5">
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
export function FoundingOffer({ action }: { action?: ReactNode }) {
  return (
    <section aria-labelledby="founding-offer-heading" className="mx-auto w-full max-w-6xl px-4 md:px-6">
      <div className="flex flex-col gap-6 rounded-card bg-yellow p-6 text-black md:flex-row md:items-center md:justify-between md:p-10">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="text-small font-semibold">Founding offer</p>
          <h2 id="founding-offer-heading" className="text-h1 text-balance">
            The paid plan free for {foundingOffer.months} months
          </h2>
          <p className="text-body">
            Pro for the first {foundingOffer.instructorLimit} independent instructors, and the School plan for the first {foundingOffer.schoolLimit} driving schools.
            No card needed.
          </p>
        </div>
        {action}
      </div>
    </section>
  );
}

/** The last word on a page: what to do next, on black. */
export function ClosingCall({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <section aria-labelledby="closing-heading" className="bg-black text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-6 md:py-20">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 id="closing-heading" className="text-h1 text-balance">
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
export function PrimaryLink({ href, children, onDark = false }: { href: string; children: ReactNode; onDark?: boolean }) {
  return (
    <Button asChild size="lg" width="responsive" variant={onDark ? 'secondary' : 'primary'}>
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

/** One plan, with its price from the configuration, what it has today and what it will have. */
export function PlanCard({ plan, signUpUrl, highlighted = false }: { plan: PlanSummary; signUpUrl: string; highlighted?: boolean }) {
  return (
    <article
      aria-labelledby={`plan-${plan.key}`}
      className={cn('flex flex-col gap-6 rounded-card bg-white p-6', highlighted ? 'border-2 border-black' : 'border border-grey-200')}
    >
      <div className="flex flex-col gap-1">
        <h3 id={`plan-${plan.key}`} className="text-h2 text-black">
          {plan.name}
        </h3>
        <p className="text-small text-grey-700">{plan.audience}</p>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-display text-black tabular-nums">{plan.price}</span>
        <span className="text-small text-grey-700">{plan.cadence}</span>
      </p>
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
