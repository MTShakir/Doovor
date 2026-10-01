'use client';

import { Sheet } from '@repo/ui/sheet';
import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { FeedbackForm } from '@/app/(account)/feedback/feedback-form';

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
