'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '../lib/cn';

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name, for example "Lesson length". */
  label: string;
  /** Formats the visible value, for example 90 as "90 min". */
  format?: (value: number) => string;
  className?: string;
}

/** Minus and plus buttons around a value (PRD 7.4 Stepper). */
export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  label,
  format = String,
  className,
}: NumberStepperProps) {
  const set = (next: number) => {
    onChange(Math.min(max, Math.max(min, next)));
  };
  const buttonClasses =
    'flex size-12 items-center justify-center rounded-full bg-grey-100 text-black hover:bg-grey-200 disabled:text-grey-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';
  return (
    <div className={cn('inline-flex items-center gap-4', className)} role="group" aria-label={label}>
      <button type="button" className={buttonClasses} onClick={() => { set(value - step); }} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus size={20} strokeWidth={1.5} aria-hidden />
      </button>
      <output className="min-w-16 text-center text-h3 tabular-nums" aria-live="polite">
        {format(value)}
      </output>
      <button type="button" className={buttonClasses} onClick={() => { set(value + step); }} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus size={20} strokeWidth={1.5} aria-hidden />
      </button>
    </div>
  );
}

export interface StepProgressProps {
  current: number;
  total: number;
  className?: string;
}

/** Onboarding progress bar at the top of each step (AUTH-04). */
export function StepProgress({ current, total, className }: StepProgressProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={cn('h-1 flex-1 rounded-full', index < current ? 'bg-black' : 'bg-grey-200')} />
        ))}
      </div>
      <p className="text-caption text-grey-700">
        Step {current} of {total}
      </p>
    </div>
  );
}
