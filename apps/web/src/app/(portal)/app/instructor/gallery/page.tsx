import { hasEntitlement } from '@repo/config/plans';
import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Images } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BackLink } from '@/components/back-link';
import { ProUpsell } from '@/components/pro';
import { requirePortal } from '@/lib/auth/session';
import { galleryContext } from '@/lib/gallery/mine';
import { myGallery } from '@/lib/gallery/read';
import { AddPassPhoto } from './add-photo';
import { MyWall } from './my-wall';

export const metadata: Metadata = { title: 'Gallery' };

/** D-218: the wall of passes a Business shows on its public profile. */
export default function GalleryPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/instructor/more">More</BackLink>
      <PageHeader title="Gallery" subtitle="The photo you take on the day somebody passes." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Wall />
        </Suspense>
      </div>
    </main>
  );
}

async function Wall() {
  await requirePortal('instructor');
  const where = await galleryContext();
  if (!where) {
    return (
      <EmptyState
        icon={Images}
        title="Your school looks after this"
        description="The gallery belongs to the Business, so whoever owns it adds to it."
      />
    );
  }

  if (!hasEntitlement(where.plan, 'gallery')) {
    return (
      <ProUpsell
        feature="The gallery"
        description="The photo you take on the day somebody passes, on your own profile, with their name and the date on it."
      />
    );
  }

  const photos = await myGallery();
  return (
    <>
      <AddPassPhoto businessId={where.businessId} learners={where.learners} />
      <MyWall photos={photos} businessName={where.businessName} colour={where.colour} />
    </>
  );
}
