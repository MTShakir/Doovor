'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { cn } from '../lib/cn';
import { useIsDesktop } from '../lib/use-media-query';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Actions pinned to the bottom of the sheet, usually one primary Button. */
  footer?: ReactNode;
}

/**
 * Details, filters and confirmations (PRD 7.1): a bottom sheet on phones, a side panel
 * from the md breakpoint. Both trap focus, close on Escape and label themselves by title.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer }: SheetProps) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-raised data-[state=open]:animate-panel-in"
            {...(description ? {} : { 'aria-describedby': undefined })}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
              <div className="flex flex-col gap-1">
                <DialogPrimitive.Title className="text-h2 text-black">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="text-small text-grey-700">{description}</DialogPrimitive.Description>
                ) : null}
              </div>
              <DialogPrimitive.Close
                className="-mt-2 -mr-3 flex size-12 items-center justify-center rounded-full hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-black"
                aria-label="Close"
              >
                <X size={24} strokeWidth={1.5} aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
            {footer ? <div className="border-t border-grey-200 px-6 py-4">{footer}</div> : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-card bg-white shadow-sheet outline-none"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-grey-200" aria-hidden />
          <div className="flex flex-col gap-1 px-4 pt-4 pb-2">
            <Drawer.Title className="text-h2 text-black">{title}</Drawer.Title>
            {description ? <Drawer.Description className="text-small text-grey-700">{description}</Drawer.Description> : null}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">{children}</div>
          {footer ? (
            <div className={cn('border-t border-grey-200 px-4 pt-3', 'pb-[max(1rem,env(safe-area-inset-bottom))]')}>{footer}</div>
          ) : (
            <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
