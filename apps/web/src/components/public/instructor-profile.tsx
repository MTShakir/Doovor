import { formatPence } from '@repo/core/money';
import { coverageWords, hourlyFromPence, joinWords, qualificationWords } from '@repo/core/public-profile';
import { specialisms as specialismLabels, transmissions } from '@repo/core/schemas/profile';
import type { Qualification } from '@repo/core/schemas/onboarding';
import { formatDateTime, formatMinutes } from '@repo/core/time';
import { Avatar } from '@repo/ui/avatar';
import { buttonVariants } from '@repo/ui/button';
import { CalendarClock, Car, Clock, Languages, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { CoverageImage } from '@/components/map/coverage-image';

/**
 * The pieces of an instructor's public profile (PUB-01, M5-02). They take plain values rather
 * than the loader's type, so the design page can show every state without a database.
 */

export interface ProfileHeaderProps {
  name: string;
  photoUrl?: string;
  qualification: Qualification;
  /** The school the instructor teaches with, and its page; nothing for somebody who runs their own Business. */
  school: { name: string; href: string } | null;
  transmission: 'manual' | 'automatic' | 'both';
  car: string | null;
  dualControls: boolean;
  lessons: readonly { durationMinutes: number; pricePence: number }[];
}

/** Who they are, and the facts a learner decides on first. Every profile is a checked instructor. */
export function ProfileHeader({ name, photoUrl, qualification, school, transmission, car, dualControls, lessons }: ProfileHeaderProps) {
  const hourly = hourlyFromPence(lessons);
  const facts = [
    transmissions.find((one) => one.value === transmission)?.label ?? transmission,
    car === null ? null : `${car}${dualControls ? ', dual controls' : ''}`,
    hourly === null ? null : `From ${formatPence(hourly)} an hour`,
  ].filter((fact): fact is string => fact !== null);

  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={photoUrl} verified size="xl" decorative />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-h1 text-black">{name}</h1>
          <p className="text-small text-grey-700">{qualificationWords(qualification)}, checked by us</p>
          {school === null ? null : (
            <p className="text-small text-grey-700">
              Teaches with{' '}
              <a href={school.href} className="font-semibold text-blue underline underline-offset-4">
                {school.name}
              </a>
            </p>
          )}
        </div>
      </div>
      {facts.length === 0 ? null : (
        <ul aria-label="At a glance" className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li key={fact} className="rounded-full bg-grey-100 px-3 py-1 text-small font-semibold text-ink">
              {fact}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

function ProfileSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-h3 text-black">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Headings are named by id; a page showing a piece twice, as the design page does, gives each its own prefix. */
interface Prefixed {
  idPrefix?: string;
}

export interface AboutInstructorProps extends Prefixed {
  bio: string | null;
  yearsTeaching: number | null;
  languages: readonly string[];
  specialisms: readonly string[];
}

/** What they wrote, and what they teach. Nothing at all when they have said nothing yet. */
export function AboutInstructor({ bio, yearsTeaching, languages, specialisms, idPrefix = '' }: AboutInstructorProps) {
  const taught = specialisms
    .map((value) => specialismLabels.find((one) => one.value === value)?.label)
    .filter((label): label is (typeof specialismLabels)[number]['label'] => label !== undefined);
  if (bio === null && yearsTeaching === null && taught.length === 0 && languages.length === 0) return null;

  return (
    <ProfileSection id={`${idPrefix}about-heading`} title="About">
      {bio === null ? null : <p className="max-w-prose text-body text-ink">{bio}</p>}
      <ul className="flex flex-col gap-2 text-body text-ink">
        {yearsTeaching === null ? null : (
          <li className="flex items-center gap-2">
            <Clock className="size-5 shrink-0 text-grey-700" aria-hidden />
            {yearsTeaching === 0
              ? 'New to teaching'
              : `Teaching for ${String(yearsTeaching)} ${yearsTeaching === 1 ? 'year' : 'years'}`}
          </li>
        )}
        {languages.length === 0 ? null : (
          <li className="flex items-center gap-2">
            <Languages className="size-5 shrink-0 text-grey-700" aria-hidden />
            Teaches in {joinWords(languages)}
          </li>
        )}
      </ul>
      {taught.length === 0 ? null : (
        <ul aria-label="Good with" className="flex flex-wrap gap-2">
          {taught.map((label) => (
            <li key={label} className="rounded-full border border-grey-200 px-3 py-1 text-small text-ink">
              {label}
            </li>
          ))}
        </ul>
      )}
    </ProfileSection>
  );
}

export interface NextTimesProps extends Prefixed {
  /** Where a time opens, already chosen, on the booking link. */
  bookingUrl: string;
  times: readonly string[];
}

/** The soonest free times, each one tap from being booked (PUB-01). */
export function NextTimes({ bookingUrl, times, idPrefix = '' }: NextTimesProps) {
  return (
    <ProfileSection id={`${idPrefix}times-heading`} title="Next free times">
      {times.length === 0 ? (
        <p className="flex items-center gap-2 text-body text-ink">
          <CalendarClock className="size-5 shrink-0 text-grey-700" aria-hidden />
          No free times in the next two weeks.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {times.map((time) => (
            <li key={time}>
              <a
                href={`${bookingUrl}?slot=${encodeURIComponent(time)}`}
                className="inline-flex min-h-12 items-center rounded-full border border-grey-200 px-4 text-small font-semibold text-black hover:border-black"
              >
                {formatDateTime(new Date(time))}
              </a>
            </li>
          ))}
        </ul>
      )}
      <a href={bookingUrl} className="text-small font-semibold text-blue underline underline-offset-4">
        See every time
      </a>
    </ProfileSection>
  );
}

export interface WhereLessonsStartProps extends Prefixed {
  radiusMiles: number;
  outcode: string | null;
  alsoCovers: readonly string[];
  areaCentre: { latitude: number; longitude: number } | null;
}

/** The area covered, drawn and said (PUB-01). The middle is rounded, never the instructor's home. */
export function WhereLessonsStart({ radiusMiles, outcode, alsoCovers, areaCentre, idPrefix = '' }: WhereLessonsStartProps) {
  return (
    <ProfileSection id={`${idPrefix}area-heading`} title="Where lessons start">
      <CoverageImage
        centre={areaCentre === null ? null : { latitude: areaCentre.latitude, longitude: areaCentre.longitude }}
        radiusMiles={radiusMiles}
        place={outcode}
        description={`Where lessons start: within ${String(radiusMiles)} ${radiusMiles === 1 ? 'mile' : 'miles'} of ${outcode ?? "the instructor's base"}`}
      />
      <p className="flex items-start gap-2 text-body text-ink">
        <MapPin className="mt-0.5 size-5 shrink-0 text-grey-700" aria-hidden />
        {coverageWords({ radiusMiles, outcode, alsoCovers })}
      </p>
    </ProfileSection>
  );
}

export interface PriceListProps extends Prefixed {
  lessons: readonly { name: string; durationMinutes: number; pricePence: number }[];
  packages: readonly { name: string; minutes: number; pricePence: number; expiryDays: number | null }[];
}

/** What lessons cost, and the packages sold (PUB-01, PAY-04). */
export function PriceList({ lessons, packages, idPrefix = '' }: PriceListProps) {
  return (
    <ProfileSection id={`${idPrefix}prices-heading`} title="Prices">
      {lessons.length === 0 ? (
        <p className="text-body text-ink">Prices are not published yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-grey-200">
          {lessons.map((lesson) => (
            <li key={`${lesson.name}:${String(lesson.durationMinutes)}`} className="flex items-baseline justify-between gap-4 py-3">
              <span className="text-body text-ink">
                {lesson.name}, {formatMinutes(lesson.durationMinutes)}
              </span>
              <span className="text-body font-semibold text-black tabular-nums">{formatPence(lesson.pricePence)}</span>
            </li>
          ))}
        </ul>
      )}
      {packages.length === 0 ? null : (
        <>
          <h3 className="text-body font-semibold text-black">Packages</h3>
          <ul className="flex flex-col divide-y divide-grey-200">
            {packages.map((pack) => {
              const hours = formatMinutes(pack.minutes);
              // "10 hours" needs no "10 hours of lessons" under it.
              const detail = [
                pack.name.toLowerCase() === hours.toLowerCase() ? null : `${hours} of lessons`,
                pack.expiryDays === null ? null : `use within ${String(pack.expiryDays)} days`,
              ].filter((part): part is string => part !== null);
              const said = detail.join(', ');
              return (
                <li key={pack.name} className="flex items-baseline justify-between gap-4 py-3">
                  <span className="flex flex-col">
                    <span className="text-body text-ink">{pack.name}</span>
                    {said === '' ? null : (
                      <span className="text-small text-grey-700">{said.charAt(0).toUpperCase() + said.slice(1)}</span>
                    )}
                  </span>
                  <span className="text-body font-semibold text-black tabular-nums">{formatPence(pack.pricePence)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </ProfileSection>
  );
}

export interface BookActionProps {
  bookingUrl: string;
  /** False when the badge is out of date (INS-03), or nothing is priced to book. */
  canBook: boolean;
}

/** The one thing to do on the page: book, or be told why not. */
export function BookAction({ bookingUrl, canBook }: BookActionProps) {
  if (!canBook) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-grey-100 px-5 text-body font-semibold text-grey-700">
          <Car className="size-5 shrink-0" aria-hidden />
          Not taking new bookings
        </p>
        {/* The Business's own waiting list is Phase 2 (GAP-01); until then, the area's (MKT-10, D-110). */}
        <a href="/learners#find-an-instructor" className="inline-flex min-h-12 items-center text-body font-semibold text-blue underline underline-offset-4">
          Find another instructor near you
        </a>
      </div>
    );
  }
  return (
    <a href={bookingUrl} className={buttonVariants({ className: 'w-full' })}>
      Book a lesson
    </a>
  );
}
