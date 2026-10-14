import { brand } from '@repo/config/brand';
import { legalDocuments, type LegalDocument } from '@repo/core/legal';
import { Button } from '@repo/ui/button';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { landingPath, safeNextPath } from '@/lib/auth/portals';
import { getAccess, needsToAgree } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { signOut } from '../actions';
import { AgreeForm } from './agree-form';

export const metadata: Metadata = { title: 'Agree to our terms' };

/**
 * Agreeing to the terms and the privacy notice before anything of theirs opens (NFR-PRV-02, D-265):
 * for somebody who signed up with Google or Apple, was added by an instructor, had an account from
 * before the terms were asked for, or comes back after the terms have changed.
 */
export default function AgreePage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<SkeletonRow />}>
        <Agree searchParams={searchParams} />
      </Suspense>
      {/* Not agreeing is allowed: it leaves, signed out, and the screen asks again next time. */}
      <form action={signOut.bind(null, 'local')} className="flex flex-col gap-2 border-t border-grey-200 pt-6">
        <Button type="submit" variant="tertiary" width="full" size="lg">
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function Agree({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const result = await getAccess();
  if (!result) redirectTo('/sign-in?next=%2Fagree');
  const { next } = await searchParams;
  const onward = safeNextPath(typeof next === 'string' ? next : undefined, landingPath(result.access));
  if (!(await needsToAgree(result))) redirectTo(onward);

  // A learner agrees to the learners' terms; anybody at a Business to the business terms; somebody
  // who is both, to both.
  const terms: LegalDocument[] = [
    ...(result.access.isLearner || result.access.memberships.length === 0 ? [legalDocuments.learnerTerms] : []),
    ...(result.access.memberships.length > 0 ? [legalDocuments.businessTerms] : []),
  ];

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Before you carry on</h1>
        <p className="text-body text-ink">
          To use {brand.name}, agree to our terms and read how we look after your information. You only need to do
          this once, unless they change.
        </p>
      </div>
      <AgreeForm terms={terms} next={onward} />
    </>
  );
}
