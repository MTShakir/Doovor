'use client';

import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ManualLearnerForm } from '@/app/(portal)/app/instructor/learners/manual-form';
import { addSchoolLearner } from './actions';

/**
 * M9-27, D-294: the school's office adds a learner by hand, choosing who teaches them or not yet,
 * or goes on to a spreadsheet of them, as an instructor does from their own list.
 */
export function AddSchoolLearner({ instructors }: { instructors: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button width="responsive" onClick={() => { setOpen(true); }}>
        <UserPlus className="size-5" aria-hidden />
        Add a learner
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Add a learner" description="Somebody the school already teaches. They claim their account later.">
        <div className="flex flex-col gap-4">
          <ManualLearnerForm
            add={addSchoolLearner}
            instructors={instructors}
            onAdded={() => {
              setOpen(false);
              router.refresh();
            }}
          />
          <p className="text-small text-grey-700">
            Got a list of them already?{' '}
            {/* Closed on the way, or it is still open on the way back: the list keeps its state. */}
            <Link
              href="/app/school/learners/import"
              onClick={() => { setOpen(false); }}
              className="font-semibold text-blue underline underline-offset-4"
            >
              Import a spreadsheet
            </Link>
          </p>
        </div>
      </Sheet>
    </>
  );
}
