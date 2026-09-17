import type { Metadata } from 'next';
import { brand } from '@repo/config/brand';
import { isPlaceSlug, isThinPlace, placeHeading, placePagePath } from '@repo/core/places';
import { instructorProfilePath } from '@repo/core/public-profile';
import { breadcrumbStructuredData } from '@repo/core/structured-data';
import { Skeleton } from '@repo/ui/skeleton';
import { notFound } from 'next/navigation';
import { JsonLdScript } from '@/components/public/json-ld';
import { Breadcrumbs, PlaceLinks } from '@/components/public/place-links';
import { SchoolInstructors } from '@/components/public/school-profile';
import { cityPage, type CityPage } from '@/lib/public/city-page';
import { publicPageMetadata } from '@/lib/public/metadata';
import { placeCard } from '@/lib/public/share-cards';
import { getSiteUrl } from '@/lib/site-url';
import { avatarUrl } from '@/lib/storage/images';

/** Which place page: a city, one of its areas, or its automatic lessons. */
export interface PlaceParams {
  city: string;
  area: string | null;
  automatic: boolean;
}

async function load({ city, area, automatic }: PlaceParams): Promise<CityPage | null> {
  if (!isPlaceSlug(city) || (area !== null && !isPlaceSlug(area))) return null;
  return cityPage(city, area, automatic);
}

function describe(page: CityPage, automatic: boolean) {
  const place = { citySlug: page.city.slug, cityName: page.city.name, area: page.area, automatic };
  return { heading: placeHeading(place), path: placePagePath(place), cityPath: placePagePath({ citySlug: page.city.slug }) };
}

/**
 * What search shows for the page, where it lives for good, its share image, and noindex while it
 * lists fewer than three instructors (PRD 8.3, 14.6).
 */
export async function placeMetadata(params: PlaceParams): Promise<Metadata> {
  const page = await load(params);
  if (!page) return { title: 'Page not found', robots: { index: false } };

  const { heading, path } = describe(page, params.automatic);
  const count = page.instructors.length;
  const where = page.area ? `${page.area.name}, ${page.city.name}` : page.city.name;
  return publicPageMetadata({
    title: heading,
    description:
      count === 0
        ? `Driving lessons in ${where} on ${brand.name}. Instructors checked by us, with their prices and free times.`
        : `${String(count)} driving ${count === 1 ? 'instructor' : 'instructors'} in ${where}, checked by us. See prices and free times, and book a lesson.`,
    path,
    indexable: !isThinPlace(count),
    card: placeCard(page, params.automatic),
  });
}

/** At least a screen tall, so the footer is not in view to be pushed away when the place arrives (D-132). */
export function PlaceSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col gap-6" aria-hidden>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** PRD 8.3: a place, the instructors search may show there, and the places around it. */
export async function PlaceContent({ params }: { params: Promise<PlaceParams> }) {
  const resolved = await params;
  const page = await load(resolved);
  if (!page) notFound();

  const { heading, path, cityPath } = describe(page, resolved.automatic);
  const site = getSiteUrl();
  const crumbs = [
    { name: brand.name, href: '/' },
    { name: `Driving lessons in ${page.city.name}`, href: cityPath },
    ...(page.area ? [{ name: page.area.name, href: path }] : []),
    ...(resolved.automatic ? [{ name: 'Automatic', href: path }] : []),
  ];
  const onCityPage = page.area === null && !resolved.automatic;
  const count = page.instructors.length;

  return (
    <div className="flex flex-col gap-8">
      <JsonLdScript data={breadcrumbStructuredData(crumbs.map((crumb) => ({ name: crumb.name, url: `${site}${crumb.href === '/' ? '' : crumb.href}` })))} />
      <div className="flex flex-col gap-3">
        <Breadcrumbs crumbs={crumbs} />
        <h1 className="text-h1 text-black">{heading}</h1>
        <p className="max-w-prose text-body text-grey-700">
          {count === 0
            ? 'No instructors are listed here yet.'
            : `${String(count)} driving ${count === 1 ? 'instructor' : 'instructors'} checked by us, with their prices. Choose one to see their free times and book.`}
        </p>
      </div>
      <SchoolInstructors
        instructors={page.instructors.map((instructor) => ({
          href: instructorProfilePath(page.city.slug, instructor.slug),
          name: instructor.name,
          photoUrl: avatarUrl(instructor.photoPath),
          qualification: instructor.qualification,
          transmission: instructor.transmission,
          car: instructor.car,
          takingBookings: true,
          hourlyFromPence: instructor.hourlyFromPence,
        }))}
      />
      {onCityPage ? (
        <>
          <PlaceLinks
            idPrefix="areas-"
            title={`Areas of ${page.city.name}`}
            links={page.areas.map((one) => ({
              href: placePagePath({ citySlug: page.city.slug, area: one }),
              name: one.name,
              count: one.instructorCount,
            }))}
          />
          <PlaceLinks
            idPrefix="automatic-"
            title="Automatic lessons"
            links={
              page.automaticCount === 0
                ? []
                : [
                    {
                      href: placePagePath({ citySlug: page.city.slug, automatic: true }),
                      name: `Automatic driving lessons in ${page.city.name}`,
                      count: page.automaticCount,
                    },
                  ]
            }
          />
        </>
      ) : (
        <PlaceLinks idPrefix="city-" title={`More in ${page.city.name}`} links={[{ href: cityPath, name: `All driving lessons in ${page.city.name}` }]} />
      )}
    </div>
  );
}
