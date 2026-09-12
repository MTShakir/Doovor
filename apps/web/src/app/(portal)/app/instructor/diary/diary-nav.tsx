import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink } from '@/components/nav-link';
import type { ChosenView, DiaryView } from '@/lib/diary/range';

const views: { value: DiaryView; label: string; whenResponsive: string }[] = [
  // Nothing chosen means the day on a phone and the week on a desktop, so the highlight
  // follows the same rule (DIA-03). Neither is aria-current: neither is definitively the one.
  { value: 'day', label: 'Day', whenResponsive: 'md:bg-transparent md:text-black' },
  { value: 'week', label: 'Week', whenResponsive: 'bg-transparent text-black md:bg-black md:text-white' },
  { value: 'month', label: 'Month', whenResponsive: '' },
];

/** Nothing chosen stays nothing chosen, so the arrows keep whichever view the screen shows. */
function href(view: ChosenView, date: string): string {
  const query = view === 'responsive' ? `date=${date}` : `view=${view}&date=${date}`;
  return `/app/instructor/diary?${query}`;
}

/**
 * Moving around the diary (DIA-03).
 *
 * Links, not buttons: the view and the date live in the address bar, so a diary can be
 * bookmarked or opened in another tab, and the arrows work before any JavaScript has run.
 */
export function DiaryNav({ view, date, previous, next, today }: {
  view: ChosenView;
  date: string;
  previous: string;
  next: string;
  today: string;
}) {
  const arrow =
    'flex size-12 shrink-0 items-center justify-center rounded-full bg-grey-100 text-black hover:bg-grey-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Diary">
      <div className="flex items-center gap-1">
        <NavLink href={href(view, previous)} aria-label="Previous" className={arrow}>
          <ChevronLeft className="size-5" aria-hidden />
        </NavLink>
        <NavLink href={href(view, next)} aria-label="Next" className={arrow}>
          <ChevronRight className="size-5" aria-hidden />
        </NavLink>
        <NavLink
          href={href(view, today)}
          className="flex h-12 items-center rounded-full px-4 text-body font-semibold text-black underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          Today
        </NavLink>
      </div>
      <ul className="inline-flex h-12 items-center gap-1 rounded-full bg-grey-100 p-1">
        {views.map((option) => (
          <li key={option.value}>
            <NavLink
              href={href(option.value, date)}
              aria-current={option.value === view ? 'page' : undefined}
              className={`flex h-10 items-center rounded-full px-4 text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                option.value === view ? 'bg-black text-white' : 'text-black hover:bg-grey-200'
              } ${view === 'responsive' && option.value !== 'month' ? `bg-black text-white ${option.whenResponsive}` : ''}`}
            >
              {option.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
