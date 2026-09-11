'use client';

import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '../lib/cn';

export interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Accessible name, for example "Coverage radius". */
  label: string;
  /** Spoken value, for example "8 miles". */
  valueText?: (value: number) => string;
  className?: string;
}

/** Single-thumb slider with a 28 px thumb inside a 48 px touch area (COV-01 radius). */
export function Slider({ value, onValueChange, min, max, step = 1, label, valueText, className }: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-12 w-full touch-none items-center select-none', className)}
      value={[value]}
      onValueChange={(values) => {
        const [next] = values;
        if (next !== undefined) onValueChange(next);
      }}
      min={min}
      max={max}
      step={step}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-grey-200">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-black" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={label}
        aria-valuetext={valueText?.(value)}
        className="block size-7 rounded-full border-2 border-black bg-white shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      />
    </SliderPrimitive.Root>
  );
}
