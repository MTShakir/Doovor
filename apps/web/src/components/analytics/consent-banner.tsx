'use client';

import { Button } from '@repo/ui/button';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { consentServerSnapshot, consentSnapshot, subscribeConsent, writeConsent, type CookieChoice } from '@/lib/analytics/consent';

/**
 * The one question we ask before counting anything (NFR-PRV-02, M6-08).
 *
 * It appears only when there is no answer yet, and only once the page is in the browser, so no page
 * has to be rendered for each request to know whether to show it. It sits over the page rather than
 * pushing it down, so it cannot move what somebody is reading.
 */
export function ConsentBanner() {
  const choice = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);
  if (choice !== null) return null;

  const answer = (next: CookieChoice) => () => {
    writeConsent(next);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-grey-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-card md:p-6"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-body text-ink">
          We count how the app is used, so we know what to fix. Nothing is counted until you say yes, and you can
          change your mind at any time.{' '}
          <Link href="/cookies" className="font-semibold text-blue underline underline-offset-4">
            What we keep
          </Link>
          .
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button onClick={answer('accepted')}>Yes, count me</Button>
          <Button variant="secondary" onClick={answer('declined')}>
            No thanks
          </Button>
        </div>
      </div>
    </div>
  );
}
