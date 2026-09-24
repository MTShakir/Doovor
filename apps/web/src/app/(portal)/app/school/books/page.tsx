import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Bookkeeping' };

/**
 * MNY-06 is Phase 2, so a school is told rather than shown (D-198). A school's books need
 * commission and instructor settlements, which the PRD has not specified yet.
 */
export default function SchoolBooksPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Bookkeeping" subtitle="Expenses, mileage and a year your accountant can file from." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Card padding="none">
          <EmptyState
            icon={BookOpen}
            title="Coming soon for schools"
            description="A school's books need commission and instructor settlements, and we would rather get those right than early. Instructors running their own business can keep theirs now."
          />
        </Card>
      </div>
    </main>
  );
}
