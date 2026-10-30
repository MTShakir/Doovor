import { Suspense, type ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site/site-chrome';
import { VisitCounter } from '@/components/site/visit-counter';
import { getAppUrl } from '@/lib/app-url';
import { launchCities } from '@/lib/site/cities';

/**
 * Every page of the public site (PRD 8.3): its own pages, profiles and place pages share the header,
 * and the footer that links every city page (PRD 14.6). Booking links live on the app and are not
 * part of it (D-109).
 */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const appUrl = getAppUrl();
  const cities = await launchCities();
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader appUrl={appUrl} />
      {/* Focusable so "Skip to content" moves the keyboard as well as the page (M6-06). */}
      <main id="content" tabIndex={-1} className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter appUrl={appUrl} cities={cities} />
      {/* Counts the page, without cookies, and carries where the visit came from to sign-up (D-413).
          It reads the page's address, so it waits for the page to be open, as the menu does. */}
      <Suspense fallback={null}>
        <VisitCounter appUrl={appUrl} />
      </Suspense>
    </div>
  );
}
