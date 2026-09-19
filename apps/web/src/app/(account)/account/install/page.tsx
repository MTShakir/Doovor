import { brand } from '@repo/config/brand';
import { ChevronLeft } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { InstallSteps } from '@/components/pwa/install-help';
import { landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Install the app', robots: { index: false } };

/**
 * Putting the app on the home screen, from the menu (PRD 8.1, D-160). The card on Today, Home and
 * Overview goes once somebody says not now; this stays, for whenever they go looking for it.
 */
export default function InstallPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-12" />}>
        <Back />
      </Suspense>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Install the app</h1>
        <p className="text-body text-grey-700">
          With {brand.shortName} on your home screen it opens in one tap, full screen, like any other app, and can tell you
          when a lesson is booked, moved or cancelled.
        </p>
      </div>
      <InstallSteps />
    </div>
  );
}

/** Back to where this person starts, which is only known once they are. */
async function Back() {
  const { access } = await requireAccess();
  return (
    <Link
      href={landingPath(access) as Route}
      className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
    >
      <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
      Back
    </Link>
  );
}
