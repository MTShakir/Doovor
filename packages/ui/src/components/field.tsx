'use client';

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '../lib/cn';

interface ControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export interface FieldProps {
  label: string;
  /** Shown under the label. Keep it to one short sentence. */
  hint?: ReactNode;
  /** Says what to do next, for example "Enter a UK postcode like LS1 4DY". */
  error?: string | undefined;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  className?: string;
  children: ReactElement<ControlProps>;
}

/** Label, hint and error wired to one control through ids and aria attributes. */
export function Field({ label, hint, error, hideLabel = false, className, children }: FieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className={cn('text-small font-semibold text-ink', hideLabel && 'sr-only')}>
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-small text-grey-700">
          {hint}
        </p>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-small font-medium text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
