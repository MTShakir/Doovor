import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink } from '@/components/nav-link';
import type { DiaryView } from '@/lib/diary/range';

const views: { value: DiaryView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function href(view: DiaryView, date: string): string {
  return `/app/instructor/diary?view=${view}&date=${date}`;
}

/**
 * Moving around the diary (DIA-03).
 *
 * Links, not buttons: the view and the date live in the address bar, so a diary can be
 * bookmarked or opened in another tab, and the arrows work before any JavaScript has run.
 */
export function DiaryNav({ view, date, previous, next, today }: {
  view: DiaryView;
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
              }`}
            >
              {option.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
