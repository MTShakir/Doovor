'use client';

import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Smartphone } from 'lucide-react';
import { useId, useSyncExternalStore } from 'react';
import type { InstallOffer } from '@/lib/pwa/install';
import { dismissInstall, installOfferSnapshot, promptInstall, subscribeToInstall } from '@/lib/pwa/install-store';

interface InstallCardProps {
  offer: Exclude<InstallOffer, null>;
  /** What having the app on the home screen does for this person. */
  why: string;
  onInstall: () => void;
  onDismiss: () => void;
}

/** The card itself, in either of its two forms. */
export function InstallCard({ offer, why, onInstall, onDismiss }: InstallCardProps) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-grey-100 text-black">
          <Smartphone size={24} strokeWidth={1.5} aria-hidden />
        </span>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle id={titleId}>Put {brand.shortName} on your home screen</CardTitle>
            <CardDescription>{offer === 'button' ? why : `${why} Tap the Share button, then Add to Home Screen.`}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {offer === 'button' ? (
              <Button variant="secondary" onClick={onInstall}>
                Install
              </Button>
            ) : null}
            {/* On its own, the text of a button with no fill lines up with the words above it. */}
            <Button variant="tertiary" onClick={onDismiss} className={offer === 'button' ? undefined : '-ml-6'}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * The offer to put the app on the home screen (PRD 8.1, M4-08). A button where the browser has its
 * own install prompt; on an iPhone or iPad, the two steps in words. Nothing is drawn until the
 * page knows which, and nothing once the app is installed or somebody has said not now.
 */
export function InstallPrompt({ why }: { why: string }) {
  const offer = useSyncExternalStore(subscribeToInstall, installOfferSnapshot, () => null);
  if (offer === null) return null;
  return <InstallCard offer={offer} why={why} onInstall={() => void promptInstall()} onDismiss={dismissInstall} />;
}
