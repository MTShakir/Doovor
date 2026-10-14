import type { Metadata, Route } from 'next';
import { isPlaceSlug } from '@repo/core/places';
import { schoolGalleryPath, schoolProfilePath } from '@repo/core/public-profile';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { GalleryHeader, GallerySkeleton } from '@/components/gallery/gallery-header';
import { FullPassWall } from '@/components/gallery/pass-wall';
import { schoolGallery } from '@/lib/gallery/read';
import { publicPageMetadata } from '@/lib/public/metadata';
import { schoolProfile } from '@/lib/public/school-profile';
import { schoolCard } from '@/lib/public/share-cards';

type Props = PageProps<'/schools/[city]/[slug]/gallery'>;

/** The gallery's words for search and sharing, with the school's share image (PUB-06, D-268). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const school = isPlaceSlug(slug) ? await schoolProfile(slug) : null;
  const gallery = school ? await schoolGallery(slug, 'whole') : null;
  if (!school || !gallery || gallery.photos.length === 0) return { title: 'Gallery not found', robots: { index: false } };

  const citySlug = school.place?.citySlug ?? null;
  return publicPageMetadata({
    title: `Learners who passed with ${school.name}`,
    description: `Photos from the day learners at ${school.name} passed their driving test, shared with their permission.`,
    path: schoolGalleryPath(citySlug, school.slug),
    // In search when the school's profile is: while one of its instructors is (D-115).
    indexable: school.instructors.some((instructor) => instructor.takingBookings),
    card: schoolCard(school),
    imagePath: schoolProfilePath(citySlug, school.slug),
  });
}

export default function SchoolGalleryRoute({ params }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Suspense fallback={<GallerySkeleton />}>
        <SchoolGallery params={params} />
      </Suspense>
    </div>
  );
}

/** PUB-06: every pass on a school's wall that is still up, every instructor's, newest first (D-268). */
async function SchoolGallery({ params }: Pick<Props, 'params'>) {
  const { city, slug } = await params;
  if (!isPlaceSlug(city) || !isPlaceSlug(slug)) notFound();
  const school = await schoolProfile(slug);
  if (!school) notFound();

  // One address, as the profile has one: an old or mistyped city moves to the one its base is in.
  const citySlug = school.place?.citySlug ?? null;
  if (city !== (citySlug ?? 'uk')) permanentRedirect(schoolGalleryPath(citySlug, school.slug) as Route);

  // A plan that does not carry the gallery, or nothing on it: there is no such page.
  const gallery = await schoolGallery(slug, 'whole');
  if (!gallery || gallery.photos.length === 0) notFound();

  return (
    <>
      <GalleryHeader
        name={school.name}
        profileHref={schoolProfilePath(citySlug, school.slug)}
        shown={gallery.photos.length}
        total={gallery.total}
      />
      <FullPassWall photos={gallery.photos} businessName={gallery.businessName} colour={gallery.colour} />
    </>
  );
}
