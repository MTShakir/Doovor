import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  [
    // A label may wrap. At 200% text on a phone a long one has nowhere else to go, and a
    // button that will not wrap pushes the whole page sideways instead (WCAG 1.4.4, M6-06).
    'inline-flex items-center justify-center gap-2 text-center font-semibold text-balance select-none',
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
        /** Darker on hover, never lighter: white on red is 4.8:1, and faded to 90% it drops under 4.5:1. */
        destructive: 'rounded-full bg-red text-white hover:brightness-90 disabled:bg-grey-200 disabled:text-grey-400',
      },
      size: {
        /** 48 px: the minimum touch target (PRD 7.1). A wrapped label makes it taller, not smaller. */
        md: 'min-h-12 px-6 py-2 text-body',
        /** 56 px: bottom-of-screen primary actions. */
        lg: 'min-h-14 px-8 py-2 text-body',
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
