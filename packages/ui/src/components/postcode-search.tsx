'use client';

import { MapPin, Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface PostcodeSearchProps extends Omit<ComponentProps<'input'>, 'type'> {
  onUseLocation?: () => void;
}

/** "Where do you want lessons?" search card input (PRD 7.5). Upper-cases as you type. */
export function PostcodeSearch({ className, onUseLocation, onChange, ...props }: PostcodeSearchProps) {
  return (
    <div className={cn('flex h-14 items-center gap-3 rounded-card bg-white px-4 shadow-raised', className)}>
      <Search className="shrink-0 text-ink" size={24} strokeWidth={1.5} aria-hidden />
      <input
        type="text"
        inputMode="text"
        autoComplete="postal-code"
        autoCapitalize="characters"
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-body text-ink uppercase outline-none placeholder:normal-case"
        onChange={(event) => {
          event.target.value = event.target.value.toUpperCase();
          onChange?.(event);
        }}
        {...props}
      />
      {onUseLocation ? (
        <button
          type="button"
          onClick={onUseLocation}
          className="-mr-2 flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-black"
          aria-label="Use my location"
        >
          <MapPin size={24} strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
