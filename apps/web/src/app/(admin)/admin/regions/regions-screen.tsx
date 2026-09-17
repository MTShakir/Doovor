'use client';

import type { SwitchOnRule } from '@repo/core/regions';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { RegionsTable, SwitchRegionDialog } from '@/components/admin/regions';
import type { AdminRegion } from '@/lib/admin/regions';
import { closeRegion, openRegion } from './actions';

/** ADM-04: the areas, and opening or closing the marketplace in one of them. */
export function RegionsScreen({ regions, rule, canSwitch }: { regions: AdminRegion[]; rule: SwitchOnRule; canSwitch: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [change, setChange] = useState<{ region: AdminRegion; open: boolean } | null>(null);

  const confirm = () => {
    if (!change) return;
    const { region, open } = change;
    startTransition(async () => {
      const result = await (open ? openRegion : closeRegion)({ area: region.area });
      toast(
        result.ok
          ? open
            ? `The marketplace is open in ${region.label}`
            : `The marketplace is closed in ${region.label}`
          : result.message,
      );
      setChange(null);
      router.refresh();
    });
  };

  return (
    <>
      <RegionsTable
        regions={regions}
        rule={rule}
        canSwitch={canSwitch}
        onOpen={(region) => { setChange({ region, open: true }); }}
        onClose={(region) => { setChange({ region, open: false }); }}
      />
      {canSwitch ? null : <p className="text-small text-grey-700">Only a super admin can open or close an area.</p>}
      <SwitchRegionDialog change={change} pending={pending} onConfirm={confirm} onCancel={() => { setChange(null); }} />
    </>
  );
}
