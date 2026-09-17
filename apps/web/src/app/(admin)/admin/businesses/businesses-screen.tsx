'use client';

import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { BusinessResults, BusinessSheet, SuspendBusinessDialog } from '@/components/admin/businesses';
import type { AdminBusiness, AdminBusinessRow } from '@/lib/admin/businesses';
import { usePersonPanel } from '../use-person-panel';
import { openBusiness, reactivateBusiness, suspendBusiness } from './actions';

/** ADM-02: the Businesses found, the one opened, suspending or reactivating it, and the people in it. */
export function BusinessesScreen({
  rows,
  query,
  viewer,
}: {
  rows: AdminBusinessRow[];
  query: string;
  viewer: { canManage: boolean; userId: string };
}) {
  const router = useRouter();
  const person = usePersonPanel(viewer);
  const [pending, startTransition] = useTransition();
  const [opened, setOpened] = useState<AdminBusiness | null>(null);
  const [suspending, setSuspending] = useState<AdminBusiness | null>(null);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  /** Reads the Business again after a change, into its panel, and the list behind it. */
  const reopen = async (businessId: string) => {
    const again = await openBusiness({ businessId });
    if (again.ok) setOpened(again.data);
    router.refresh();
  };

  const open = (row: AdminBusinessRow) => {
    startTransition(async () => {
      const result = await openBusiness({ businessId: row.businessId });
      if (result.ok) setOpened(result.data);
      else toast(result.message);
    });
  };

  const suspend = (reason: string) => {
    if (!suspending) return;
    const business = suspending;
    startTransition(async () => {
      const result = await suspendBusiness({ businessId: business.businessId, reason });
      if (!result.ok) {
        setReasonError(result.fields?.reason ?? result.message);
        return;
      }
      toast(`${business.name} is suspended`);
      setSuspending(null);
      setReasonError(undefined);
      await reopen(business.businessId);
    });
  };

  const reactivate = (business: AdminBusiness) => {
    startTransition(async () => {
      const result = await reactivateBusiness({ businessId: business.businessId });
      toast(result.ok ? `${business.name} is in good standing again` : result.message);
      await reopen(business.businessId);
    });
  };

  return (
    <>
      <BusinessResults rows={rows} query={query} onOpen={open} />
      <BusinessSheet
        business={opened}
        canSuspend={viewer.canManage}
        pending={pending}
        onClose={() => { setOpened(null); }}
        onSuspend={(business) => {
          // One layer at a time: the panel closes while the question is asked.
          setOpened(null);
          setReasonError(undefined);
          setSuspending(business);
        }}
        onReactivate={reactivate}
        onOpenMember={(member) => {
          // From the Business to the person: one panel at a time.
          setOpened(null);
          person.open(member.userId);
        }}
      />
      {person.panel}
      <SuspendBusinessDialog
        business={suspending}
        pending={pending}
        error={reasonError}
        onConfirm={suspend}
        onCancel={() => {
          setSuspending(null);
          setReasonError(undefined);
        }}
      />
    </>
  );
}
