import { PageHeader } from '@repo/ui/app-shell';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ImportLearners } from '@/app/(portal)/app/instructor/learners/import/import-learners';
import { importSchoolLearners } from '../actions';

export const metadata: Metadata = { title: 'Import learners' };

/** M9-27, LRN-01, D-294: the school's learners from a spreadsheet, each to be given an instructor after. */
export default function SchoolImportPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Import learners"
        subtitle="From a spreadsheet. Give each an instructor afterwards, from Learners."
        back={
          <Link
            href="/app/school/learners"
            className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            Learners
          </Link>
        }
      />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <ImportLearners importer={importSchoolLearners} listPath="/app/school/learners" />
      </div>
    </main>
  );
}
