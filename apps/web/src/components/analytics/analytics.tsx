'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { clientEnv } from '@/env/client';
import { consentServerSnapshot, consentSnapshot, subscribeConsent } from '@/lib/analytics/consent';
import { startCounting, stopCounting } from '@/lib/analytics/posthog';

/**
 * Counting, once somebody has said yes (NFR-PRV-02, PRD 16, M6-08).
 *
 * The library itself is only fetched after the answer is yes: before that nothing is loaded, no
 * request is made, and nothing is stored. Saying no afterwards stops it and forgets what it kept.
 */
export function Analytics() {
  const choice = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);

  useEffect(() => {
    if (!clientEnv.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (choice === 'accepted') void startCounting();
    else if (choice === 'declined') void stopCounting();
  }, [choice]);

  return null;
}
