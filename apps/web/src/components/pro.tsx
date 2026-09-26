import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Sparkles } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * What marks something as Pro (D-209).
 *
 * One mark, used everywhere: a small yellow tag. Yellow is the brand's one accent and it always
 * carries black text (D-009), so it reads as the same thing on a menu row, beside a heading and on
 * an upsell. A whole screen washed in it was the other idea and was dropped: yellow at that size
 * stops meaning "this is Pro" and starts meaning "something is wrong here", and the pale wash below
 * does the job on the one card that needs it.
 */
export function ProTag({ muted = false }: { muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? 'inline-flex min-h-6 items-center rounded-full border border-grey-400 px-2.5 py-0.5 text-caption font-semibold text-grey-700'
          : 'inline-flex min-h-6 items-center rounded-full bg-yellow px-2.5 py-0.5 text-caption font-semibold text-black'
      }
    >
      Pro
    </span>
  );
}

/** A heading with the tag beside it, for a screen that is part of Pro. */
export function ProHeading({ children }: { children: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {children}
      <ProTag />
    </span>
  );
}

export interface ProUpsellProps {
  /** What they came for, in the words the menu used: "Bookkeeping", "Calendar sync". */
  feature: string;
  /** What it does for them, one sentence. */
  description: string;
  /** Where the plan lives for this portal. */
  planHref?: string;
}

/**
 * What somebody on Free sees where a Pro feature would be (D-209). It says what the feature is
 * for rather than only that they cannot have it, because a wall that does not say what is behind
 * it sells nothing.
 */
export function ProUpsell({ feature, description, planHref = '/app/instructor/plan' }: ProUpsellProps) {
  return (
    <Card className="flex flex-col gap-4 bg-yellow-100" role="region" aria-labelledby="pro-upsell-title">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-black" aria-hidden />
        <div className="flex flex-col gap-1">
          <CardTitle id="pro-upsell-title">{feature} is part of Pro</CardTitle>
          <CardDescription className="text-ink">{description}</CardDescription>
        </div>
      </div>
      <Button asChild width="full">
        <Link href={planHref as Route}>See what Pro includes</Link>
      </Button>
    </Card>
  );
}
