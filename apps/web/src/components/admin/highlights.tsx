import { countOf } from '@repo/core/counts';
import { formatPence } from '@repo/core/money';
import { Foldable } from '@repo/ui/foldable';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { ArrivalRow, BusyRow, EarningRow, PlatformHighlights } from '@/lib/admin/highlights';

/** Finding a Business again is what staff do next, and the Businesses screen finds it by name. */
function businessHref(name: string): Route {
  return `/admin/businesses?q=${encodeURIComponent(name)}` as Route;
}

function Rows({ children, empty }: { children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="px-4 py-3 text-small text-grey-700">{empty}</p>;
  return (
    <ul className="py-1">
      {children.map((row, index) => (
        // A divider belongs inside the item it parts from the one before, not beside it in the list.
        <li key={index}>
          {index === 0 ? null : <ListDivider />}
          {row}
        </li>
      ))}
    </ul>
  );
}

function place(index: number): string {
  return `${String(index + 1)}.`;
}

function EarningList({ rows, empty }: { rows: EarningRow[]; empty: string }) {
  return (
    <Rows empty={empty}>
      {rows.map((row, index) => (
        <ListRow
          key={row.id}
          asChild
          chevron
          leading={<span className="w-6 text-right text-small text-grey-700 tabular-nums">{place(index)}</span>}
          title={row.name}
          subtitle={countOf(row.payments, 'payment', 'payments')}
          trailing={<span className="text-body font-semibold text-black tabular-nums">{formatPence(row.pence)}</span>}
        >
          <Link href={businessHref(row.name)} />
        </ListRow>
      ))}
    </Rows>
  );
}

function BusyList({ rows, empty }: { rows: BusyRow[]; empty: string }) {
  return (
    <Rows empty={empty}>
      {rows.map((row, index) => (
        <ListRow
          key={row.id}
          asChild
          chevron
          leading={<span className="w-6 text-right text-small text-grey-700 tabular-nums">{place(index)}</span>}
          title={row.name}
          subtitle={countOf(row.lessons, 'lesson', 'lessons')}
          trailing={<span className="text-body font-semibold text-black tabular-nums">{countOf(row.learners, 'learner', 'learners')}</span>}
        >
          <Link href={businessHref(row.name)} />
        </ListRow>
      ))}
    </Rows>
  );
}

function ArrivalsList({ rows, empty }: { rows: ArrivalRow[]; empty: string }) {
  return (
    <Rows empty={empty}>
      {rows.map((row) => (
        <ListRow
          key={row.id}
          asChild
          chevron
          title={row.name}
          subtitle={`${row.kind === 'school' ? 'School' : 'Instructor of one'}, joined ${row.joined}`}
        >
          <Link href={businessHref(row.name)} />
        </ListRow>
      ))}
    </Rows>
  );
}

/**
 * Who stands out on the platform over the dashboard's days (ADM-01, D-172): the schools and
 * instructors who took the most, those teaching the most learners, and who joined. Each list folds
 * away, so the dashboard stays a screen of figures until staff open one.
 */
export function PlatformHighlights({
  highlights,
  shown,
  moreHref,
}: {
  highlights: PlatformHighlights;
  /** How many arrivals are on screen, for the words under the card. */
  shown: number;
  /** Where "Show more" goes, keeping the days already chosen. */
  moreHref: Route;
}) {
  const { earningSchools, earningInstructors, busiestSchools, busiestInstructors, arrivals, more } = highlights;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="highlights-title">
      <h2 id="highlights-title" className="text-h3 text-black">
        Who stands out
      </h2>
      <Foldable title="Top earning schools" subtitle={countOf(earningSchools.length, 'school', 'schools')}>
        <EarningList rows={earningSchools} empty="No school took a payment in these days." />
      </Foldable>
      <Foldable title="Top earning instructors" subtitle={countOf(earningInstructors.length, 'instructor', 'instructors')}>
        <EarningList rows={earningInstructors} empty="No instructor of one took a payment in these days." />
      </Foldable>
      <Foldable title="Schools with the most learners" subtitle={countOf(busiestSchools.length, 'school', 'schools')}>
        <BusyList rows={busiestSchools} empty="No school taught a lesson in these days." />
      </Foldable>
      <Foldable title="Instructors with the most learners" subtitle={countOf(busiestInstructors.length, 'instructor', 'instructors')}>
        <BusyList rows={busiestInstructors} empty="No instructor of one taught a lesson in these days." />
      </Foldable>
      <Foldable
        title="New to the platform"
        subtitle={more ? `The ${String(shown)} newest` : countOf(arrivals.length, 'Business', 'Businesses')}
      >
        <>
          <ArrivalsList rows={arrivals} empty="Nobody joined in these days." />
          {more ? (
            <div className="border-t border-grey-200 px-4 py-2">
              <Link
                href={moreHref}
                scroll={false}
                className="flex h-12 w-fit items-center rounded-full text-body font-semibold text-black underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                Show more
              </Link>
            </div>
          ) : null}
        </>
      </Foldable>
    </section>
  );
}
