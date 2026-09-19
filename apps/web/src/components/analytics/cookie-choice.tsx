'use client';

import { Button } from '@repo/ui/button';
import { useSyncExternalStore } from 'react';
import {
  consentServerSnapshot,
  consentSnapshot,
  forgetConsent,
  subscribeConsent,
  unknownChoice,
  writeConsent,
} from '@/lib/analytics/consent';

/**
 * Changing your mind (NFR-PRV-02, M6-08). It sits on the cookies page, says what the answer is
 * now, and lets it be changed without hunting for a banner that has already gone.
 */
export function CookieChoice() {
  const choice = useSyncExternalStore(subscribeConsent, consentSnapshot, consentServerSnapshot);
  if (choice === unknownChoice) return null;

  return (
    <div className="flex flex-col gap-3 rounded-card border border-grey-200 bg-white p-4">
      <p className="text-body text-ink">
        {choice === 'accepted'
          ? 'You have said yes to being counted.'
          : choice === 'declined'
            ? 'You have said no to being counted, and nothing is.'
            : 'You have not answered yet.'}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {choice === 'accepted' ? (
          <Button
            variant="secondary"
            onClick={() => {
              writeConsent('declined');
            }}
          >
            Stop counting me
          </Button>
        ) : (
          <Button
            onClick={() => {
              writeConsent('accepted');
            }}
          >
            Yes, count me
          </Button>
        )}
        {choice === null ? null : (
          <Button
            variant="tertiary"
            onClick={() => {
              forgetConsent();
            }}
          >
            Ask me again
          </Button>
        )}
      </div>
    </div>
  );
}
