import type { Metadata, Route } from 'next';
import { brand } from '@repo/config/brand';
import { isPlaceSlug, placePagePath } from '@repo/core/places';
import { instructorProfilePath, qualificationWords, schoolProfilePath } from '@repo/core/public-profile';
import { instructorStructuredData } from '@repo/core/structured-data';
import { Skeleton } from '@repo/ui/skeleton';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import {
  AboutInstructor,
  BookAction,
  NextTimes,
  PriceList,
  ProfileHeader,
  WhereLessonsStart,
} from '@/components/public/instructor-profile';
import { JsonLdScript } from '@/components/public/json-ld';
import { PlaceLinks } from '@/components/public/place-links';
import { getAppUrl } from '@/lib/app-url';
import { instructorProfile, nextOpenTimes, type InstructorProfilePage } from '@/lib/public/instructor-profile';
import { publicPageMetadata } from '@/lib/public/metadata';
import { instructorCard } from '@/lib/public/share-cards';
import { getSiteUrl } from '@/lib/site-url';
import { avatarUrl } from '@/lib/storage/images';

type Props = PageProps<'/instructors/[city]/[slug]'>;

/** The profile's own words for search and sharing, where it lives for good, and its share image (PRD 14.6). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = isPlaceSlug(slug) ? await instructorProfile(slug) : null;
  if (!profile) return { title: 'Instructor not found', robots: { index: false } };

  const where = profile.place?.cityName;
  return publicPageMetadata({
    title: where ? `${profile.name}, driving instructor in ${where}` : `${profile.name}, driving instructor`,
    description:
      profile.bio ?? `${qualificationWords(profile.qualification)} on ${brand.name}. See prices and free times, and book a lesson.`,
    path: instructorProfilePath(profile.place?.citySlug ?? null, profile.slug),
    // Out of search, hidden by the instructor (PUB-04) or with a badge out of date (INS-03): still there
    // for anybody with the link, but not for search engines.
    indexable: profile.inSearch,
    card: instructorCard(profile),
    type: 'profile',
  });
}

export default function InstructorProfileRoute({ params }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Suspense fallback={<ProfileSkeleton />}>
        <InstructorProfile params={params} />
      </Suspense>
    </div>
  );
}

/** PUB-01: one instructor, as a learner deciding whether to book them sees them. */
async function InstructorProfile({ params }: Pick<Props, 'params'>) {
  const { city, slug } = await params;
  if (!isPlaceSlug(city) || !isPlaceSlug(slug)) notFound();
  const profile = await instructorProfile(slug);
  if (!profile) notFound();

  // One address per profile: an old or mistyped city moves to the one the base is in.
  const path = instructorProfilePath(profile.place?.citySlug ?? null, profile.slug);
  if (city !== (profile.place?.citySlug ?? 'uk')) permanentRedirect(path as Route);

  const bookingUrl = `${getAppUrl()}/book/${profile.slug}`;
  const canBook = profile.takingBookings && profile.lessons.length > 0;
  const site = getSiteUrl();
  const photoUrl = avatarUrl(profile.photoPath);
  const schoolUrl = profile.business.type === 'school' ? schoolProfilePath(profile.business.citySlug, profile.business.slug) : null;
  const place = profile.place;
  const structured = instructorStructuredData({
    url: `${site}${path}`,
    bookingUrl,
    name: profile.name,
    ...(photoUrl === undefined ? {} : { imageUrl: photoUrl }),
    jobTitle: qualificationWords(profile.qualification),
    languages: profile.languages,
    cityName: place?.cityName ?? null,
    school: schoolUrl === null ? null : { name: profile.business.name, url: `${site}${schoolUrl}` },
    lessons: profile.lessons,
    breadcrumbs: [
      { name: brand.name, url: site },
      ...(place?.hasHub ? [{ name: `Driving lessons in ${place.cityName}`, url: `${site}/driving-lessons/${place.citySlug}` }] : []),
      { name: profile.name, url: `${site}${path}` },
    ],
  });

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
      <JsonLdScript data={structured} />
      <div className="flex flex-col gap-8">
        <ProfileHeader
          name={profile.name}
          photoUrl={photoUrl}
          qualification={profile.qualification}
          school={schoolUrl === null ? null : { name: profile.business.name, href: schoolUrl }}
          transmission={profile.transmission}
          car={profile.car}
          dualControls={profile.dualControls}
          lessons={profile.lessons}
        />
        <div className="md:hidden">
          <BookAction bookingUrl={bookingUrl} canBook={canBook} />
        </div>
        {canBook ? (
          <Suspense fallback={<Skeleton className="h-28 w-full" />}>
            <FreeTimes profile={profile} bookingUrl={bookingUrl} />
          </Suspense>
        ) : null}
        <AboutInstructor
          bio={profile.bio}
          yearsTeaching={profile.yearsTeaching}
          languages={profile.languages}
          specialisms={profile.specialisms}
        />
        <WhereLessonsStart
          radiusMiles={profile.radiusMiles}
          outcode={profile.outcode}
          alsoCovers={profile.alsoCovers}
          areaCentre={profile.areaCentre}
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
      <aside aria-label="Prices and booking" className="flex flex-col gap-6 md:sticky md:top-8 md:rounded-card md:border md:border-grey-200 md:p-6">
        <PriceList lessons={profile.lessons} packages={profile.packages} />
        <div className="hidden md:block">
          <BookAction bookingUrl={bookingUrl} canBook={canBook} />
        </div>
      </aside>
    </div>
  );
}

/** The soonest times, for the shortest lesson on offer: kept for about a minute, not hours. */
async function FreeTimes({ profile, bookingUrl }: { profile: InstructorProfilePage; bookingUrl: string }) {
  const shortest = Math.min(...profile.lessons.map((lesson) => lesson.durationMinutes));
  const times = await nextOpenTimes(profile.instructorId, shortest);
  return <NextTimes bookingUrl={bookingUrl} times={times} />;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-56 w-full" />
    </div>
  );
}
