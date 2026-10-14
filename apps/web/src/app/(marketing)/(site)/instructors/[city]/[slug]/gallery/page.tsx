import type { Metadata, Route } from 'next';
import { isPlaceSlug } from '@repo/core/places';
import { instructorGalleryPath, instructorProfilePath } from '@repo/core/public-profile';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import { GalleryHeader, GallerySkeleton } from '@/components/gallery/gallery-header';
import { FullPassWall } from '@/components/gallery/pass-wall';
import { instructorGallery } from '@/lib/gallery/read';
import { instructorProfile } from '@/lib/public/instructor-profile';
import { publicPageMetadata } from '@/lib/public/metadata';
import { instructorCard } from '@/lib/public/share-cards';

type Props = PageProps<'/instructors/[city]/[slug]/gallery'>;

/** The gallery's words for search and sharing, with the profile's share image (PUB-06, D-268). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = isPlaceSlug(slug) ? await instructorProfile(slug) : null;
  const gallery = profile ? await instructorGallery(slug, 'whole') : null;
  if (!profile || !gallery || gallery.photos.length === 0) return { title: 'Gallery not found', robots: { index: false } };

  const citySlug = profile.place?.citySlug ?? null;
  return publicPageMetadata({
    title: `Learners who passed with ${profile.name}`,
    description: `Photos from the day ${profile.name}'s learners passed their driving test, shared with their permission.`,
    path: instructorGalleryPath(citySlug, profile.slug),
    // In search when the profile is, and out of it when the profile is (PUB-04, INS-03).
    indexable: profile.inSearch,
    card: instructorCard(profile),
    imagePath: instructorProfilePath(citySlug, profile.slug),
  });
}

export default function InstructorGalleryRoute({ params }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <Suspense fallback={<GallerySkeleton />}>
        <InstructorGallery params={params} />
      </Suspense>
    </div>
  );
}

/** PUB-06: every pass on an instructor's wall that is still up, newest first (D-268). */
async function InstructorGallery({ params }: Pick<Props, 'params'>) {
  const { city, slug } = await params;
  if (!isPlaceSlug(city) || !isPlaceSlug(slug)) notFound();
  const profile = await instructorProfile(slug);
  if (!profile) notFound();

  // One address, as the profile has one: an old or mistyped city moves to the one the base is in.
  const citySlug = profile.place?.citySlug ?? null;
  if (city !== (citySlug ?? 'uk')) permanentRedirect(instructorGalleryPath(citySlug, profile.slug) as Route);

  // A plan that does not carry the gallery, or nothing on it: there is no such page.
  const gallery = await instructorGallery(slug, 'whole');
  if (!gallery || gallery.photos.length === 0) notFound();

  return (
    <>
      <GalleryHeader
        name={profile.name}
        profileHref={instructorProfilePath(citySlug, profile.slug)}
        shown={gallery.photos.length}
        total={gallery.total}
      />
      <FullPassWall photos={gallery.photos} businessName={gallery.businessName} colour={gallery.colour} />
    </>
  );
}
