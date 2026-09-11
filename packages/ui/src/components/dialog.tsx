'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}

/** Centred modal for desktop-only moments (admin). On phones, prefer Sheet (PRD 7.1). */
export function Dialog({ open, onOpenChange, title, description, children, footer }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-card bg-white p-6 shadow-raised data-[state=open]:animate-fade-in"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="text-h2 text-black">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-small text-grey-700">{description}</DialogPrimitive.Description>
            ) : null}
          </div>
          {children}
          {footer ? <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
