import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Shared look for text inputs and selects: grey-100 fill, grey-700 boundary (D-009). */
export const fieldControlClasses = cn(
  'block h-12 w-full rounded-input border border-grey-700 bg-grey-100 px-4 text-body text-ink',
  'transition-colors duration-200 ease-out',
  'focus-visible:border-black focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-black',
  'disabled:cursor-not-allowed disabled:border-grey-200 disabled:text-grey-400',
  'aria-invalid:border-red aria-invalid:bg-white aria-invalid:focus-visible:outline-red',
);

export type InputProps = ComponentProps<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  return <input type={type} className={cn(fieldControlClasses, className)} {...props} />;
}

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(fieldControlClasses, 'h-auto min-h-28 py-3', className)} {...props} />;
}
