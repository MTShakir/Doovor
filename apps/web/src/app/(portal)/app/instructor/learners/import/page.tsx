import type { Metadata } from 'next';
import { PageHeader } from '@repo/ui/app-shell';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { SkeletonRow } from '@repo/ui/skeleton';
import { requirePortal } from '@/lib/auth/session';
import { ImportLearners } from './import-learners';

export const metadata: Metadata = { title: 'Import learners' };

export default function ImportPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Import your learners"
        subtitle="A spreadsheet of names and numbers. Nothing leaves this page until you say so."
        back={
          <Link
            href="/app/instructor/learners"
            className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            Learners
          </Link>
        }
      />
      <div className="flex flex-col gap-4 px-4 md:max-w-3xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}

/** LRN-03. The file is read in the browser, so a spreadsheet of learners is only sent once
 * the instructor has seen what will be imported. */
async function Gate() {
  await requirePortal('instructor');
  return <ImportLearners />;
}
