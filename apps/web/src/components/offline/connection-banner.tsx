'use client';

import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { connectionSnapshot, serverConnectionSnapshot, subscribeToConnection } from '@/lib/offline/connection';

/**
 * Says so when the phone has no signal (PRD 8.1, PRG-09, M4-10), and what still works: Today and its
 * lessons, with everything typed kept on the phone. Yellow with black text, the warning colours
 * (D-009), across the top of whatever screen is open, and gone the moment the signal is back.
 */
export function ConnectionBanner() {
  const online = useSyncExternalStore(subscribeToConnection, connectionSnapshot, serverConnectionSnapshot);
  if (online) return null;

  return (
    <div role="status" className="flex items-start gap-2 bg-yellow px-4 py-2 text-small font-medium text-black md:px-8">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">No signal.</span> Today and its lessons still open, and what you type stays on this phone.
      </p>
    </div>
  );
}
