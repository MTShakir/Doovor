'use client';

import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { PersonSheet, ResetTwoStepDialog, SuspendAccountDialog, ViewAsDialog } from '@/components/admin/people';
import type { AdminPerson } from '@/lib/admin/people';
import { openPerson, reactivateAccount, resetTwoStep, suspendAccount } from './person-actions';
import { startViewingAs } from './view-as-actions';

/**
 * ADM-02: a person's panel, and suspending, reactivating or resetting two-step verification from
 * it, for any admin screen that lists people. Returns the way to open somebody, and the panel and
 * its questions to render once.
 */
export function usePersonPanel(viewer: { canManage: boolean; userId: string }): { open: (userId: string) => void; panel: ReactNode } {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [opened, setOpened] = useState<AdminPerson | null>(null);
  const [suspending, setSuspending] = useState<AdminPerson | null>(null);
  const [resetting, setResetting] = useState<AdminPerson | null>(null);
  const [viewing, setViewing] = useState<AdminPerson | null>(null);
  const [viewError, setViewError] = useState<string | undefined>(undefined);
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  /** Reads the person again after a change, into their panel, and the list behind it. */
  const reopen = async (userId: string) => {
    const again = await openPerson({ userId });
    if (again.ok) setOpened(again.data);
    router.refresh();
  };

  const open = (userId: string) => {
    startTransition(async () => {
      const result = await openPerson({ userId });
      if (result.ok) setOpened(result.data);
      else toast(result.message);
    });
  };

  const suspend = (reason: string) => {
    if (!suspending) return;
    const person = suspending;
    startTransition(async () => {
      const result = await suspendAccount({ userId: person.userId, reason });
      if (!result.ok) {
        setReasonError(result.fields?.reason ?? result.message);
        return;
      }
      toast(`${person.name} is suspended and signed out everywhere`);
      setSuspending(null);
      setReasonError(undefined);
      await reopen(person.userId);
    });
  };

  const reactivate = (person: AdminPerson) => {
    startTransition(async () => {
      const result = await reactivateAccount({ userId: person.userId });
      toast(result.ok ? `${person.name} can sign in again` : result.message);
      await reopen(person.userId);
    });
  };

  const reset = () => {
    if (!resetting) return;
    const person = resetting;
    startTransition(async () => {
      const result = await resetTwoStep({ userId: person.userId });
      toast(result.ok ? `Two-step verification is reset for ${person.name}` : result.message);
      setResetting(null);
      await reopen(person.userId);
    });
  };

  const viewAs = (reason: string) => {
    if (!viewing) return;
    const person = viewing;
    startTransition(async () => {
      const result = await startViewingAs({ userId: person.userId, reason });
      if (!result.ok) {
        setViewError(result.fields?.reason ?? result.message);
        return;
      }
      // A fresh page, so every request from here, the browser's own too, views as them.
      window.location.assign(result.data.path);
    });
  };

  const panel = (
    <>
      <PersonSheet
        person={opened}
        viewer={viewer}
        pending={pending}
        onClose={() => { setOpened(null); }}
        onSuspend={(person) => {
          // One layer at a time: the panel closes while the question is asked.
          setOpened(null);
          setReasonError(undefined);
          setSuspending(person);
        }}
        onReactivate={reactivate}
        onResetTwoStep={(person) => {
          setOpened(null);
          setResetting(person);
        }}
        onViewAs={(person) => {
          setOpened(null);
          setViewError(undefined);
          setViewing(person);
        }}
      />
      <SuspendAccountDialog
        person={suspending}
        pending={pending}
        error={reasonError}
        onConfirm={suspend}
        onCancel={() => {
          setSuspending(null);
          setReasonError(undefined);
        }}
      />
      <ResetTwoStepDialog person={resetting} pending={pending} onConfirm={reset} onCancel={() => { setResetting(null); }} />
      <ViewAsDialog
        person={viewing}
        pending={pending}
        error={viewError}
        onConfirm={viewAs}
        onCancel={() => {
          setViewing(null);
          setViewError(undefined);
        }}
      />
    </>
  );

  return { open, panel };
}
