'use client';

import { useRouter } from 'next/navigation';
import { LinkedFeesCard } from '@/components/school/linked-fees';
import type { LinkedFees } from '@/lib/school/fees';
import { saveFeeTerms, settleFee } from './actions';

/** The school's fees, each linked instructor's in a card of their own (M9-13, D-287). */
export function FeesScreen({ linked }: { linked: LinkedFees[] }) {
  const router = useRouter();
  const handlers = {
    saveTerms: saveFeeTerms,
    settle: settleFee,
    refresh: () => { router.refresh(); },
  };
  return (
    <>
      {linked.map((one) => (
        <LinkedFeesCard key={one.linkId} linked={one} handlers={handlers} />
      ))}
    </>
  );
}
