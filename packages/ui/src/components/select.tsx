'use client';

// A client component, so a Field in a server-rendered form labels the select itself rather than
// the wrapper it is drawn in (the Field gives its child an id, D-130).
import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { fieldControlClasses } from './input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'children'> {
  options: SelectOption[];
  /** Adds an empty first option, for example "Choose a lesson type". */
  placeholder?: string;
}

/** Native select: the most reliable picker on phones and with screen readers. */
export function Select({ className, options, placeholder, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select className={cn(fieldControlClasses, 'appearance-none pr-12', className)} {...props}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink"
        size={20}
        strokeWidth={1.5}
        aria-hidden
      />
    </div>
  );
}
