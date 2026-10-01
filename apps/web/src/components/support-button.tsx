'use client';

import { Sheet } from '@repo/ui/sheet';
import { SkeletonRow } from '@repo/ui/skeleton';
import { LifeBuoy } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

/**
 * The form brings a form library, a resolver, the image preparation and a storage client with it,
 * and this button is on every portal screen while almost nobody presses it. So it is loaded when
 * the sheet opens and never before, the way the map library is (COV-01).
 */
const FeedbackForm = dynamic(
  () => import('@/app/(account)/feedback/feedback-form').then((module) => module.FeedbackForm),
  { ssr: false, loading: () => <SkeletonRow /> },
);

/**
 * Support, from anywhere in a portal (D-241).
 *
 * The same form as `/feedback`, in a sheet, because somebody who has just hit a problem should
 * not have to leave the screen it happened on to tell us about it. The form reads the address bar
 * for the page it is reporting, so opening it here records where they actually were rather than
 * recording `/feedback` every time.
 *
 * It is the one form either way: a second one would drift from this one by the second change.
 */
export function SupportButton({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Support"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
        className={[
          'inline-flex size-12 shrink-0 items-center justify-center rounded-full text-black',
          'transition-colors duration-200 ease-out hover:bg-quiet',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
        ].join(' ')}
      >
        <LifeBuoy size={24} strokeWidth={1.5} aria-hidden />
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Tell us something"
        description="A request, a problem, or anything else. We read every one."
      >
        <FeedbackForm userId={userId} />
      </Sheet>
    </>
  );
}
