'use client';

import { Button, type ButtonProps } from '@repo/ui/button';
import { cn } from '@repo/ui/lib/cn';
import { useSyncExternalStore, type ComponentProps, type SubmitEvent } from 'react';

const subscribe = () => () => undefined;

/** False while only the server HTML is on screen, true once React runs in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

/**
 * A form that JavaScript handles: client validation, then a Server Action call.
 *
 * It always posts, so a submit that beats hydration can never put a password or a code into
 * the address bar, server logs or browser history. While `pending`, repeat submits (a second
 * press of Enter, for example) are ignored.
 *
 * Register text fields without a default value: React Hook Form then keeps anything typed
 * before hydration instead of clearing it.
 */
export function ClientForm({
  pending = false,
  onSubmit,
  ...props
}: Omit<ComponentProps<'form'>, 'method' | 'action' | 'noValidate'> & { pending?: boolean }) {
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    onSubmit?.(event);
  };
  return <form {...props} method="post" noValidate aria-busy={pending || undefined} onSubmit={submit} />;
}

/**
 * The primary action of a ClientForm. Disabled until hydrated, so pressing it (or Enter in a
 * field) before the page is ready does nothing instead of posting the raw form. It keeps its
 * normal look meanwhile, so the page does not flash.
 */
export function SubmitButton({ className, disabled, variant, ...props }: Omit<ButtonProps, 'type' | 'asChild'>) {
  const hydrated = useHydrated();
  const primary = variant === undefined || variant === 'primary';
  return (
    <Button
      {...props}
      variant={variant}
      type="submit"
      disabled={disabled === true || !hydrated}
      className={cn(!hydrated && disabled !== true && primary && 'disabled:bg-black disabled:text-white', className)}
    />
  );
}
