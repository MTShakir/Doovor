'use client';

import { transmissions } from '@repo/core/schemas/profile';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Route } from 'next';
import { NavLink } from '@/components/nav-link';

export interface SchoolDiaryNavProps {
  date: string;
  previous: string;
  next: string;
  today: string;
  instructors: { id: string; name: string }[];
  instructor: string;
  transmission: string;
}

/**
 * The day, and who is shown on it (DIA-09).
 *
 * The PRD also asks for a branch filter. Branches are a Phase 5 feature and there is nothing
 * to filter by yet (D-062), so that one arrives with them.
 */
export function SchoolDiaryNav({
  date,
  previous,
  next,
  today,
  instructors,
  instructor,
  transmission,
}: SchoolDiaryNavProps) {
  const router = useRouter();
  // The filters are held here rather than read back from the address bar: two changed
  // quickly would otherwise build the second address from the state before the first.
  const [chosen, setChosen] = useState({ instructor, transmission });
  const arrow =
    'flex size-12 shrink-0 items-center justify-center rounded-full bg-grey-100 text-black hover:bg-grey-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';

  const address = (patch: { date?: string; instructor?: string; transmission?: string }): string => {
    const query = new URLSearchParams({ date: patch.date ?? date });
    const who = patch.instructor ?? chosen.instructor;
    const gearbox = patch.transmission ?? chosen.transmission;
    if (who !== '') query.set('instructor', who);
    if (gearbox !== '') query.set('transmission', gearbox);
    return `/app/school/diary?${query.toString()}`;
  };

  const filter = (patch: { instructor?: string; transmission?: string }) => {
    setChosen((current) => ({ ...current, ...patch }));
    router.push(address(patch) as Route);
  };

  return (
    <nav className="flex flex-wrap items-end justify-between gap-3" aria-label="Diary">
      <div className="flex flex-wrap items-center gap-1">
        <NavLink href={address({ date: previous })} aria-label="Previous" className={arrow}>
          <ChevronLeft className="size-5" aria-hidden />
        </NavLink>
        <NavLink href={address({ date: next })} aria-label="Next" className={arrow}>
          <ChevronRight className="size-5" aria-hidden />
        </NavLink>
        <NavLink
          href={address({ date: today })}
          className="flex h-12 items-center rounded-full px-4 text-body font-semibold text-black underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          Today
        </NavLink>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Instructor" className="max-w-56 flex-1 basis-40">
          <Select
            options={[{ value: '', label: 'Everyone' }, ...instructors.map((one) => ({ value: one.id, label: one.name }))]}
            value={chosen.instructor}
            onChange={(event) => { filter({ instructor: event.target.value }); }}
          />
        </Field>
        <Field label="Transmission" className="max-w-48 flex-1 basis-32">
          <Select
            options={[{ value: '', label: 'Any' }, ...transmissions.map((one) => ({ value: one.value, label: one.label }))]}
            value={chosen.transmission}
            onChange={(event) => { filter({ transmission: event.target.value }); }}
          />
        </Field>
      </div>
    </nav>
  );
}
