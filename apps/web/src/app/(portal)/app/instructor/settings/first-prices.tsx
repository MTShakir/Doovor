'use client';

import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { FirstPricesForm } from '@/components/catalogue/first-prices-form';
import { saveFirstPrices } from './actions';

/**
 * Settings' prices for somebody with none yet (R-05, D-266): the first price, as onboarding asks it,
 * and then the full table of prices for each lesson and length in its place.
 */
export function FirstPrices() {
  const router = useRouter();
  return (
    <FirstPricesForm
      hourlyPrice={null}
      packagePrice={null}
      save={saveFirstPrices}
      submitLabel="Save prices"
      submitVariant="secondary"
      onSaved={() => {
        toast('Prices saved');
        router.refresh();
      }}
    />
  );
}
