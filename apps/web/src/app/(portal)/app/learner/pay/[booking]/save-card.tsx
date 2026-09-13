'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { CreditCard } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { saveTestCard, startCardSetup } from './actions';

export interface SaveCardProps {
  bookingId: string;
  /** A card is already kept, so this replaces the one charged rather than adding the first. */
  replacing: boolean;
  /** True when this environment has a real payments provider behind it. */
  live: boolean;
}

/**
 * Saving a card for a lesson charged the day before (PAY-03, M3-09). Nothing is taken here; the
 * newest card kept with the Business is the one charged.
 */
export function SaveCard({ bookingId, replacing, live }: SaveCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);

  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await startCardSetup({ bookingId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSetupId(result.data.setupId);
    });
  };

  const finish = () => {
    if (setupId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await saveTestCard({ bookingId, setupId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast('Card saved');
      setSetupId(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {setupId === null ? (
        <Button
          variant={replacing ? 'secondary' : 'primary'}
          width="responsive"
          size={replacing ? 'md' : 'lg'}
          pending={pending}
          onClick={start}
        >
          <CreditCard className="size-5" aria-hidden />
          {replacing ? 'Use a different card' : 'Save a card'}
        </Button>
      ) : live ? (
        <p className="text-body text-grey-700">Enter your card details to finish.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-small text-grey-700">
            There is no card machine on this environment. This stands in for one, and keeps a card the way a real one
            does.
          </p>
          <Button width="responsive" pending={pending} onClick={finish}>
            Save a test card
          </Button>
        </div>
      )}
    </div>
  );
}
