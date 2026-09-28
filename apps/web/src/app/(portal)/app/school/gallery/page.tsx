import { hasEntitlement } from '@repo/config/plans';
import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Images } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BackLink } from '@/components/back-link';
import { AddPassPhoto } from '@/components/gallery/add-photo';
import { MyWall } from '@/components/gallery/my-wall';
import { requirePortal } from '@/lib/auth/session';
import { galleryContext } from '@/lib/gallery/mine';
import { myGallery } from '@/lib/gallery/read';

export const metadata: Metadata = { title: 'Gallery' };

/**
 * D-218: the school's wall, which is every instructor's. The same screen the instructor portal
 * has, because it is the same wall: a school owner should not have to ask somebody who teaches to
 * take a photo down.
 */
export default function SchoolGalleryPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/school/more">More</BackLink>
      <PageHeader title="Gallery" subtitle="The photos your instructors take when somebody passes." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Wall />
        </Suspense>
      </div>
    </main>
  );
}

async function Wall() {
  await requirePortal('school');
  const where = await galleryContext();
  if (!where) {
    return <EmptyState icon={Images} title="Nothing to show" description="The gallery belongs to a Business." />;
  }
  if (!hasEntitlement(where.plan, 'gallery')) {
    return (
      <EmptyState
        icon={Images}
        title="The gallery is not on this plan"
        description="The photos your instructors take on the day somebody passes, on your school's profile."
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
