'use client';

import { Toaster as SonnerToaster, toast } from 'sonner';

/** Mount once in the root layout. Black toasts at the bottom, 200 ms motion (PRD 7.4). */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={{ bottom: 88 }}
      mobileOffset={{ bottom: 88 }}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-center gap-3 rounded-card bg-black px-4 py-3 text-small text-white shadow-raised md:w-[360px]',
          title: 'flex-1 font-medium',
          description: 'text-small text-grey-200',
          actionButton:
            'h-10 shrink-0 rounded-full bg-white px-4 text-small font-semibold text-black focus-visible:outline-2 focus-visible:outline-white',
          success: 'bg-black',
          error: 'bg-black',
        },
      }}
    />
  );
}

/** PRD 7.1 "Forgiving": undo for 5 seconds after a destructive action. */
export const UNDO_WINDOW_MS = 5000;

export function toastWithUndo(message: string, onUndo: () => void, options: { onExpire?: () => void } = {}) {
  let undone = false;
  return toast(message, {
    duration: UNDO_WINDOW_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        undone = true;
        onUndo();
      },
    },
    onAutoClose: () => {
      if (!undone) options.onExpire?.();
    },
  });
}

export { toast };
