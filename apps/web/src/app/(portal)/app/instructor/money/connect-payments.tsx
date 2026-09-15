'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { useTransition } from 'react';
import { connectPayments, refreshPaymentsState } from './actions';

/**
 * PAY-01: the one button that connects a Business to its payments account, and the way back
 * for somebody who finished the setup somewhere else.
 */
export function ConnectPayments({
  started,
  ready,
  screen,
}: {
  started: boolean;
  ready: boolean;
  screen: 'instructor' | 'school';
}) {
  const [pending, startTransition] = useTransition();

  const connect = () => {
    startTransition(async () => {
      const result = await connectPayments({ screen });
      if (!result.ok) {
        toast(result.message);
        return;
      }
      window.location.assign(result.data.url);
    });
  };

  const refresh = () => {
    startTransition(async () => {
      const result = await refreshPaymentsState();
      toast(
        !result.ok
          ? result.message
          : result.data.chargesEnabled
            ? 'Payments are on'
            : 'Not quite ready yet. Finish the setup and check again.',
      );
    });
  };

  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <Button width="responsive" pending={pending} onClick={connect}>
        {ready ? 'Manage payments' : started ? 'Finish setting up' : 'Set up payments'}
      </Button>
      {started && !ready ? (
        <Button variant="secondary" width="responsive" pending={pending} onClick={refresh}>
          I have finished
        </Button>
      ) : null}
    </div>
  );
}
