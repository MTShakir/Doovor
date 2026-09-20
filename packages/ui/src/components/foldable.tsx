import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface FoldableProps {
  title: string;
  /** Under the title, such as how many there are inside. */
  subtitle?: string;
  /** Open when the page arrives. Folded away otherwise, so a screen of cards stays readable. */
  open?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * A card that folds away (PRD 7.4, D-172). Plain HTML underneath, so it opens and closes before
 * the page has come alive, and a screen reader is told whether it is open without being asked.
 */
export function Foldable({ title, subtitle, open = false, className, children }: FoldableProps) {
  return (
    <details open={open} className={cn('group rounded-card border border-grey-200 bg-white', className)}>
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 rounded-card p-4',
          'hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
          // The arrow is the only marker: the browser's own triangle would sit beside it.
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body font-semibold text-black">{title}</span>
          {subtitle ? <span className="text-small text-grey-700">{subtitle}</span> : null}
        </span>
        <ChevronDown className="size-5 shrink-0 text-grey-700 transition-transform duration-200 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-grey-200">{children}</div>
    </details>
  );
}
