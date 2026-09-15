'use client';

import { formatPence } from '@repo/core/money';
import { formatMinutes } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { Banknote, Landmark, PackagePlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { PackageForSale } from '@/lib/payments/packages';
import { recordOfflinePackage } from './money-actions';

/**
 * A package the learner paid for in person, recorded in three taps: open, choose the package, say
 * how it was paid (PAY-04, PAY-05, M3-16). The credit is theirs to book with straight away.
 */
export function SellPackage({
  learnerId,
  learnerName,
  packages,
}: {
  learnerId: string;
  learnerName: string;
  packages: PackageForSale[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(packages[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pack = packages.find((one) => one.id === chosen) ?? packages[0];
  if (!pack) return null;

  const record = (method: 'cash' | 'bank') => {
    setError(null);
    startTransition(async () => {
      const result = await recordOfflinePackage({ learnerId, packageId: pack.id, method });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast(`${formatMinutes(pack.minutes)} of credit added for ${learnerName}`);
    });
  };

  return (
    <>
      <Button variant="secondary" width="responsive" onClick={() => { setOpen(true); }}>
        <PackagePlus className="size-5" aria-hidden />
        Record a package paid in person
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title="Package paid in person"
        description={`What ${learnerName} bought, and how they paid. The hours are theirs to book with straight away.`}
      >
        <div className="flex flex-col gap-3 pb-2">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Package">
            <Select
              value={pack.id}
              onChange={(event) => { setChosen(event.target.value); }}
              options={packages.map((one) => ({ value: one.id, label: `${one.name}, ${formatPence(one.pricePence)}` }))}
            />
          </Field>
          <Button width="full" size="lg" pending={pending} onClick={() => { record('cash'); }}>
            <Banknote className="size-5" aria-hidden />
            Paid in cash
          </Button>
          <Button width="full" size="lg" variant="secondary" disabled={pending} onClick={() => { record('bank'); }}>
            <Landmark className="size-5" aria-hidden />
            Paid by bank transfer
          </Button>
        </div>
      </Sheet>
    </>
  );
}
