import { ChevronLeft } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The way back from a screen reached from somewhere else.
 *
 * UX: it was written out by hand on the books screens and the learner card, and left off the
 * screens reached from More, so half the product had a way back and half did not. One component
 * means one look and one hit area everywhere, and a screen that gains a back link cannot drift
 * away from the others later.
 *
 * It names where it goes rather than saying "Back", because somebody who has been tapping around
 * for a minute does not necessarily remember where they came from.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="px-4 pt-4 md:px-8">
      <Link
        href={href as Route}
        className="inline-flex min-h-12 items-center gap-1 text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <ChevronLeft className="size-5 shrink-0" aria-hidden />
        {children}
      </Link>
    </div>
  );
}
