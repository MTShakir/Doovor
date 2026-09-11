'use client';

import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export interface TimeSlot {
  id: string;
  /** Display time, for example "14:30" (PRD 7.6). */
  label: string;
  disabled?: boolean;
}

export interface TimeSlotGridProps {
  slots: TimeSlot[];
  value: string | null;
  onChange: (id: string) => void;
  /** Accessible group name, for example "Times on Tue 15 Sep". */
  label: string;
  className?: string;
}

/**
 * Time slot grid (PRD 7.4). The selected slot is yellow with a black border and a tick,
 * because yellow alone does not meet the 3:1 non-text contrast rule on white (D-009).
 */
export function TimeSlotGrid({ slots, value, onChange, label, className }: TimeSlotGridProps) {
  return (
    <div role="group" aria-label={label} className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4', className)}>
      {slots.map((slot) => {
        const selected = slot.id === value;
        return (
          <button
            key={slot.id}
            type="button"
            aria-pressed={selected}
            disabled={slot.disabled}
            onClick={() => {
              onChange(slot.id);
            }}
            className={cn(
              'relative flex h-12 items-center justify-center gap-1 rounded-input text-body tabular-nums transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
              selected
                ? 'border-2 border-black bg-yellow font-semibold text-black'
                : 'border border-grey-200 bg-grey-100 text-ink hover:border-black',
              'disabled:border-transparent disabled:bg-white disabled:text-grey-400 disabled:line-through',
            )}
          >
            {selected ? <Check size={16} strokeWidth={2.5} aria-hidden /> : null}
            {slot.label}
          </button>
        );
      })}
    </div>
  );
}
