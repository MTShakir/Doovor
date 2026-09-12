'use client';

import { Briefcase, Check, GraduationCap, House, MapPin } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../lib/cn';

export interface PickupOption {
  id: string;
  kind: 'home' | 'school' | 'work' | 'custom';
  label: string;
  address: string;
  isDefault?: boolean;
}

const icons: Record<PickupOption['kind'], ComponentType<{ className?: string }>> = {
  home: House,
  school: GraduationCap,
  work: Briefcase,
  custom: MapPin,
};

export interface PickupPointPickerProps {
  label: string;
  options: PickupOption[];
  /** The one chosen, or the default when nothing has been chosen yet. */
  value?: string;
  onChange: (id: string) => void;
  /** Offered under the list, for a learner who is somewhere new today. */
  onAdd?: () => void;
  emptyMessage?: string;
}

/**
 * Where this lesson starts (COV-04). A short list of places the learner has used, largest
 * touch targets the screen allows, because it is chosen on a phone while standing up.
 */
export function PickupPointPicker({
  label,
  options,
  value,
  onChange,
  onAdd,
  emptyMessage = 'No pickup points yet.',
}: PickupPointPickerProps) {
  const chosen = value ?? options.find((option) => option.isDefault)?.id;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-semibold text-ink">{label}</legend>
      {options.length === 0 ? <p className="text-small text-grey-700">{emptyMessage}</p> : null}
      <ul className="flex flex-col gap-2">
        {options.map((option) => {
          const Icon = icons[option.kind];
          const selected = option.id === chosen;
          return (
            <li key={option.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => { onChange(option.id); }}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 rounded-card border px-4 py-3 text-left',
                  'transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
                  selected ? 'border-black bg-grey-100' : 'border-grey-200 bg-white hover:bg-grey-100',
                )}
              >
                <Icon className="size-5 shrink-0 text-ink" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold text-black">{option.label}</span>
                  <span className="truncate text-small text-grey-700">{option.address}</span>
                </span>
                {selected ? <Check className="ml-auto size-5 shrink-0 text-black" strokeWidth={3} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="self-start text-small font-semibold text-blue underline underline-offset-4"
        >
          Add another place
        </button>
      ) : null}
    </fieldset>
  );
}
