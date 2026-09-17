import { formatPence } from '@repo/core/money';
import { qualificationWords } from '@repo/core/public-profile';
import { transmissions } from '@repo/core/schemas/profile';
import type { Qualification } from '@repo/core/schemas/onboarding';
import { Avatar } from '@repo/ui/avatar';
import { ChevronRight } from 'lucide-react';

/**
 * The pieces of a school's public profile (PUB-01, M5-03). Plain values in, so the design page
 * can show every state without a database.
 */

export interface SchoolHeaderProps {
  name: string;
  logoUrl?: string;
  /** The city its base is in, when it is known. */
  cityName: string | null;
  instructorCount: number;
}

export function SchoolHeader({ name, logoUrl, cityName, instructorCount }: SchoolHeaderProps) {
  const people = instructorCount === 1 ? '1 instructor' : `${String(instructorCount)} instructors`;
  return (
    <header className="flex items-center gap-4">
      <Avatar name={name} src={logoUrl} size="xl" decorative />
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-h1 text-black">{name}</h1>
        <p className="text-small text-grey-700">
          {cityName === null ? 'Driving school' : `Driving school in ${cityName}`}, {people} taking learners
        </p>
      </div>
    </header>
  );
}

export interface SchoolInstructor {
  /** Where the instructor's own profile lives. */
  href: string;
  name: string;
  photoUrl?: string;
  qualification: Qualification;
  transmission: 'manual' | 'automatic' | 'both';
  car: string | null;
  takingBookings: boolean;
  hourlyFromPence: number | null;
}

export interface SchoolInstructorsProps {
  instructors: readonly SchoolInstructor[];
  idPrefix?: string;
}

/** The school's instructors a learner can find, each opening their own profile (PUB-01). */
export function SchoolInstructors({ instructors, idPrefix = '' }: SchoolInstructorsProps) {
  return (
    <section aria-labelledby={`${idPrefix}instructors-heading`} className="flex flex-col gap-3">
      <h2 id={`${idPrefix}instructors-heading`} className="text-h3 text-black">
        Instructors
      </h2>
      {instructors.length === 0 ? (
        <p className="text-body text-ink">No instructors are taking learners here yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-200 rounded-card border border-grey-200">
          {instructors.map((instructor) => {
            const facts = [
              qualificationWords(instructor.qualification),
              transmissions.find((one) => one.value === instructor.transmission)?.label ?? instructor.transmission,
              instructor.car,
              instructor.takingBookings
                ? instructor.hourlyFromPence === null
                  ? null
                  : `From ${formatPence(instructor.hourlyFromPence)} an hour`
                : 'Not taking new bookings',
            ].filter((fact): fact is string => fact !== null);
            return (
              <li key={instructor.href}>
                <a href={instructor.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-grey-100">
                  <Avatar name={instructor.name} src={instructor.photoUrl} verified size="lg" decorative />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-body font-semibold text-black">{instructor.name}</span>
                    <span className="text-small text-grey-700">{facts.join(', ')}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-grey-700" aria-hidden />
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
