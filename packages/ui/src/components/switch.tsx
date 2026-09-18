'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
  label: ReactNode;
  description?: ReactNode;
}

export function Switch({ label, description, className, id, ...props }: SwitchProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <div className={cn('flex min-h-12 items-center justify-between gap-4 py-2', className)}>
      {/* The words give way, not the switch: a label too long for its line wraps inside itself
          rather than pushing the switch off the screen (M6-06). */}
      <label htmlFor={controlId} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-ink">{label}</span>
        {description ? <span className="text-small text-grey-700">{description}</span> : null}
      </label>
      <SwitchPrimitive.Root
        id={controlId}
        className={cn(
          'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-grey-700 bg-grey-100 transition-colors duration-200',
          'data-[state=checked]:border-black data-[state=checked]:bg-black',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
          'disabled:opacity-50',
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block size-6 translate-x-0.5 rounded-full bg-grey-700 shadow-card transition-transform duration-200',
            'data-[state=checked]:translate-x-[26px] data-[state=checked]:bg-white',
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}
