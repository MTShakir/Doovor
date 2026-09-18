import type { Metadata, Route } from 'next';
import { brand } from '@repo/config/brand';
import { isPlaceSlug, placePagePath } from '@repo/core/places';
import { instructorProfilePath, schoolProfilePath } from '@repo/core/public-profile';
import { schoolStructuredData } from '@repo/core/structured-data';
import { Skeleton } from '@repo/ui/skeleton';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { PriceList } from '@/components/public/instructor-profile';
import { JsonLdScript } from '@/components/public/json-ld';
import { PlaceLinks } from '@/components/public/place-links';
import { SchoolHeader, SchoolInstructors } from '@/components/public/school-profile';
import { publicPageMetadata } from '@/lib/public/metadata';
import { schoolProfile } from '@/lib/public/school-profile';
import { schoolCard } from '@/lib/public/share-cards';
import { getSiteUrl } from '@/lib/site-url';
import { avatarUrl } from '@/lib/storage/images';

type Props = PageProps<'/schools/[city]/[slug]'>;

/**
 * The school's name for search and sharing, where it lives for good, and its share image (PRD 14.6).
 * Out of search while none of its instructors is in it (D-115).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const school = isPlaceSlug(slug) ? await schoolProfile(slug) : null;
  if (!school) return { title: 'School not found', robots: { index: false } };

  const where = school.place?.cityName;
  return publicPageMetadata({
    title: where ? `${school.name}, driving school in ${where}` : `${school.name}, driving school`,
    description: `Driving lessons with ${school.name} on ${brand.name}: its instructors, prices and packages.`,
    path: schoolProfilePath(school.place?.citySlug ?? null, school.slug),
    indexable: school.instructors.some((instructor) => instructor.takingBookings),
    card: schoolCard(school),
  });
}

export default function SchoolProfileRoute({ params }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Suspense
        fallback={
          // At least a screen tall, so the footer is not in view to be pushed away when the school arrives (D-132).
          <div className="flex min-h-dvh flex-col gap-6" aria-hidden>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        }
      >
        <SchoolProfile params={params} />
      </Suspense>
    </div>
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
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
        {place?.hasHub ? (
          <PlaceLinks
            title={`More in ${place.cityName}`}
            links={[
              {
                href: placePagePath({ citySlug: place.citySlug }),
                name: `Driving lessons in ${place.cityName}`,
              },
            ]}
          />
        ) : null}
      </div>
      <aside aria-label="Prices" className="flex flex-col gap-6 md:rounded-card md:border md:border-grey-200 md:p-6">
        <PriceList lessons={school.lessons} packages={school.packages} />
      </aside>
    </div>
  );
}
