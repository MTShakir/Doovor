'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { useTransition } from 'react';
import { markAllRead } from './actions';

/** One tap to clear the lot (NTF-01). */
export function MarkAllRead({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="tertiary"
      pending={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await markAllRead();
          toast(result.ok ? 'All marked as read' : result.message);
        });
      }}
    >
      Mark all as read ({count})
    </Button>
  );
}
