import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export interface ChipProps extends ComponentProps<'button'> {
  selected?: boolean;
}

/**
 * Filter chip (PRD 7.4), for example Manual, Automatic, Available this week. Visually 40 px
 * tall; an invisible extension makes the tap target 48 px.
 */
export function Chip({ selected = false, className, type, children, ...props }: ChipProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={selected}
      className={cn(
        'relative inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-1.5 text-small font-semibold',
        'transition-colors duration-200 ease-out after:absolute after:-inset-1 after:content-[""]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
        selected ? 'bg-black text-white' : 'bg-grey-100 text-black hover:bg-grey-200',
        'disabled:pointer-events-none disabled:text-grey-400',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex gap-2 overflow-x-auto px-1 py-1', className)} {...props} />;
}
