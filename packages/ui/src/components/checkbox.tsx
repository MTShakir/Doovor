'use client';

import { Check } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CheckboxProps extends ComponentProps<typeof CheckboxPrimitive.Root> {
  label: ReactNode;
  description?: ReactNode;
}

/** 24 px box inside a 48 px tap row. */
export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <div className={cn('flex min-h-12 items-start gap-3 py-3', className)}>
      <CheckboxPrimitive.Root
        id={controlId}
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-grey-700 bg-white',
          'data-[state=checked]:border-black data-[state=checked]:bg-black data-[state=checked]:text-white',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
          'disabled:border-grey-200 disabled:bg-grey-100',
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check size={16} strokeWidth={3} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={controlId} className="flex flex-col gap-0.5">
        <span className="text-body text-ink">{label}</span>
        {description ? <span className="text-small text-grey-700">{description}</span> : null}
      </label>
    </div>
  );
}
