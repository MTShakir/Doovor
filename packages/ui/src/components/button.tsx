import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap select-none',
    'transition-colors duration-200 ease-out disabled:pointer-events-none aria-busy:pointer-events-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
  ],
  {
    variants: {
      variant: {
        /** One per screen (PRD 7.1). */
        primary: 'rounded-full bg-black text-white hover:bg-ink disabled:bg-grey-200 disabled:text-grey-400',
        secondary: 'rounded-full bg-grey-100 text-black hover:bg-grey-200 disabled:text-grey-400',
        tertiary: 'rounded-full bg-transparent text-black underline-offset-4 hover:underline disabled:text-grey-400',
        destructive: 'rounded-full bg-red text-white hover:opacity-90 disabled:bg-grey-200 disabled:text-grey-400',
      },
      size: {
        /** 48 px: the minimum touch target (PRD 7.1). */
        md: 'h-12 px-6 text-body',
        /** 56 px: bottom-of-screen primary actions. */
        lg: 'h-14 px-8 text-body',
        /** Square 48 px icon button. Needs an aria-label. */
        icon: 'size-12 shrink-0',
      },
      width: {
        auto: 'w-auto',
        full: 'w-full',
        /** Full width on phones, natural width from tablet up (brief section 5). */
        responsive: 'w-full md:w-auto',
      },
    },
    // No default width: `w-auto` would override the square icon size.
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (for example a link) with button styles. */
  asChild?: boolean;
  /** Shows a spinner, keeps the label for screen readers and blocks repeat presses. */
  pending?: boolean;
}

export function Button({
  className,
  variant,
  size,
  width,
  asChild = false,
  pending = false,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, width }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button type={type ?? 'button'} className={classes} aria-busy={pending || undefined} {...props}>
      {pending ? <LoaderCircle className="animate-spin" size={20} strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}
