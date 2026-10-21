'use client';

import type { Result } from '@repo/core/result';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { FirstPricesForm } from '@/components/catalogue/first-prices-form';

/**
 * Settings' prices for a Business with none yet (R-05, D-266, D-329): the first price, as onboarding
 * asks it, and then the full table of prices for each lesson and length in its place. An instructor
 * who skipped it in onboarding sees it, and so does a school, which onboarding never asks.
 */
export function FirstPrices({ save }: { save: (input: unknown) => Promise<Result<null>> }) {
  const router = useRouter();
  return (
    <FirstPricesForm
      hourlyPrice={null}
      packagePrice={null}
      save={save}
      submitLabel="Save prices"
      submitVariant="secondary"
      onSaved={() => {
        toast('Prices saved');
        router.refresh();
      }}
    />
  );
}
