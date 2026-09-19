'use client';

import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { LoadingRegion, Skeleton } from '@repo/ui/skeleton';
import { CircleCheck, Ellipsis, EllipsisVertical, Share, SquarePlus, type LucideIcon } from 'lucide-react';
import { useId, useSyncExternalStore, type ReactNode } from 'react';
import type { InstallHelp } from '@/lib/pwa/install';
import { installHelpSnapshot, listenForInstall, promptInstall, subscribeToInstall } from '@/lib/pwa/install-store';

// The page may be the first a device opens, and the browser hands over its prompt once, early.
listenForInstall();

const iphoneNote = 'An iPhone shows notifications from the app only once it is on the home screen.';

/** A button as the browser draws it, so a step can be matched to what is on the screen. */
function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="ml-0.5 inline size-5 align-text-bottom" strokeWidth={1.5} aria-hidden />;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-body text-ink">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-black text-small font-semibold text-white tabular-nums"
      >
        {n}
      </span>
      <span className="min-w-0 pt-0.5">{children}</span>
    </li>
  );
}

function Steps({ title, lead, note, children }: { title: string; lead?: string; note?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle id={titleId}>{title}</CardTitle>
        {lead ? <CardDescription>{lead}</CardDescription> : null}
      </div>
      <ol className="flex flex-col gap-3">{children}</ol>
      {note ? <CardDescription>{note}</CardDescription> : null}
    </Card>
  );
}

/** Share, as Safari hides it behind its menu on a newer iPhone. */
function ShareStep({ n }: { n: number }) {
  return (
    <Step n={n}>
      Tap Share <Glyph icon={Share} />. On a newer iPhone it is in the menu behind the three dots <Glyph icon={Ellipsis} /> at
      the bottom of the screen.
    </Step>
  );
}

/**
 * How to put the app on the home screen from where somebody is (PRD 8.1, D-160), in each of the
 * ways a browser allows it. Drawn by the Install the app page, and on the design page.
 */
export function InstallHelpCard({ help, host, onInstall }: { help: InstallHelp; host: string; onInstall: () => void }) {
  const titleId = useId();
  switch (help) {
    case 'installed':
      return (
        <Card role="status" className="flex items-start gap-3">
          <CircleCheck className="size-6 shrink-0 text-black" strokeWidth={1.5} aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="text-h3 text-black">You have the app</p>
            <CardDescription>
              {brand.shortName} is on this device, and opens from the home screen like any other app.
            </CardDescription>
          </div>
        </Card>
      );
    case 'button':
      return (
        <Card role="region" aria-labelledby={titleId} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle id={titleId}>Install it from here</CardTitle>
            <CardDescription>Your browser asks you to confirm, and then {brand.shortName} is on your home screen.</CardDescription>
          </div>
          {/* Full width on a phone; its own width from a tablet up, rather than stretched by the card. */}
          <Button width="responsive" className="md:self-start" onClick={onInstall}>
            Install
          </Button>
        </Card>
      );
    case 'ios-safari':
      return (
        <Steps title="Three taps in Safari" note={iphoneNote}>
          <ShareStep n={1} />
          <Step n={2}>
            Scroll down and tap Add to Home Screen <Glyph icon={SquarePlus} />.
          </Step>
          <Step n={3}>Tap Add.</Step>
        </Steps>
      );
    case 'ios-other-browser':
      return (
        <Steps title="Add it from Safari" lead="On an iPhone or iPad, apps go on the home screen from Safari." note={iphoneNote}>
          <Step n={1}>
            Open Safari and go to <span className="font-semibold break-all">{host}</span>.
          </Step>
          <ShareStep n={2} />
          <Step n={3}>
            Tap Add to Home Screen <Glyph icon={SquarePlus} />, then Add.
          </Step>
        </Steps>
      );
    case 'browser-menu':
      return (
        <Steps
          title="From your browser's menu"
          note="If there is no such option, this browser cannot install apps. Chrome, Edge, Samsung Internet and Safari can."
        >
          <Step n={1}>
            Open the browser&apos;s menu <Glyph icon={EllipsisVertical} />. In Chrome it is the three dots at the top right.
          </Step>
          <Step n={2}>Tap Install app, or Add to Home screen.</Step>
        </Steps>
      );
  }
}

function useInstallHelp(): InstallHelp | null {
  // Null on the server and while hydrating: which browser this is is only known in it.
  return useSyncExternalStore(subscribeToInstall, installHelpSnapshot, () => null);
}

/** The Install the app page's answer for this device (PRD 8.1, D-160). */
export function InstallSteps() {
  const help = useInstallHelp();
  if (help === null) {
    return (
      <LoadingRegion>
        <Skeleton className="h-40 w-full" />
      </LoadingRegion>
    );
  }
  return <InstallHelpCard help={help} host={window.location.host} onInstall={() => void promptInstall()} />;
}

/** Drawn only outside the installed app, where there is still something to install (D-160). */
export function OutsideTheApp({ children }: { children: ReactNode }) {
  return useInstallHelp() === 'installed' ? null : children;
}
