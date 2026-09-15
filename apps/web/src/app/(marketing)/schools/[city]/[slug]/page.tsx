import type { Metadata, Route } from 'next';
import { brand } from '@repo/config/brand';
import { isPlaceSlug } from '@repo/core/places';
import { instructorProfilePath, schoolProfilePath } from '@repo/core/public-profile';
import { schoolStructuredData } from '@repo/core/structured-data';
import { Skeleton } from '@repo/ui/skeleton';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { PriceList } from '@/components/public/instructor-profile';
import { JsonLdScript } from '@/components/public/json-ld';
import { SchoolHeader, SchoolInstructors } from '@/components/public/school-profile';
import { schoolProfile } from '@/lib/public/school-profile';
import { getSiteUrl } from '@/lib/site-url';
import { avatarUrl } from '@/lib/storage/images';

type Props = PageProps<'/schools/[city]/[slug]'>;

/** The school's name for search and sharing, and where it lives for good (PRD 14.6). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const school = isPlaceSlug(slug) ? await schoolProfile(slug) : null;
  if (!school) return { title: 'School not found', robots: { index: false } };

  const where = school.place?.cityName;
  return {
    title: where ? `${school.name}, driving school in ${where}` : `${school.name}, driving school`,
    description: `Driving lessons with ${school.name} on ${brand.name}: its instructors, prices and packages.`,
    alternates: { canonical: `${getSiteUrl()}${schoolProfilePath(school.place?.citySlug ?? null, school.slug)}` },
  };
}

export default function SchoolProfileRoute({ params }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <p className="text-small font-semibold text-grey-700">{brand.name}</p>
      <Suspense
        fallback={
          <div className="flex flex-col gap-6" aria-hidden>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <SchoolProfile params={params} />
      </Suspense>
    </main>
  );
}

/** PUB-01: a school, its instructors a learner can find, and what lessons cost there. */
async function SchoolProfile({ params }: Pick<Props, 'params'>) {
  const { city, slug } = await params;
  if (!isPlaceSlug(city) || !isPlaceSlug(slug)) notFound();
  const school = await schoolProfile(slug);
  if (!school) notFound();

  // One address per school: an old or mistyped city moves to the one its base is in.
  if (city !== (school.place?.citySlug ?? 'uk')) {
    permanentRedirect(schoolProfilePath(school.place?.citySlug ?? null, school.slug) as Route);
  }

  const site = getSiteUrl();
  const url = `${site}${schoolProfilePath(school.place?.citySlug ?? null, school.slug)}`;
  const logoUrl = avatarUrl(school.logoPath);
  const place = school.place;
  const structured = schoolStructuredData({
    url,
    name: school.name,
    ...(logoUrl === undefined ? {} : { logoUrl }),
    cityName: place?.cityName ?? null,
    instructors: school.instructors.map((instructor) => ({
      name: instructor.name,
      url: `${site}${instructorProfilePath(instructor.citySlug, instructor.slug)}`,
    })),
    lessons: school.lessons,
    breadcrumbs: [
      { name: brand.name, url: site },
      ...(place?.hasHub ? [{ name: `Driving lessons in ${place.cityName}`, url: `${site}/driving-lessons/${place.citySlug}` }] : []),
      { name: school.name, url },
    ],
  });

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
      <JsonLdScript data={structured} />
      <div className="flex flex-col gap-8">
        <SchoolHeader
          name={school.name}
          logoUrl={logoUrl}
          cityName={school.place?.cityName ?? null}
          instructorCount={school.instructors.length}
        />
        <SchoolInstructors
          instructors={school.instructors.map((instructor) => ({
            href: instructorProfilePath(instructor.citySlug, instructor.slug),
            name: instructor.name,
            photoUrl: avatarUrl(instructor.photoPath),
            qualification: instructor.qualification,
            transmission: instructor.transmission,
            car: instructor.car,
            takingBookings: instructor.takingBookings,
            hourlyFromPence: instructor.hourlyFromPence,
          }))}
        />
      </div>
      <aside aria-label="Prices" className="flex flex-col gap-6 md:rounded-card md:border md:border-grey-200 md:p-6">
        <PriceList lessons={school.lessons} packages={school.packages} />
      </aside>
    </div>
  );
}
