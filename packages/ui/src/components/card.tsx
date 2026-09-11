import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const cardVariants = cva('rounded-card', {
  variants: {
    variant: {
      outline: 'border border-grey-200 bg-white',
      filled: 'bg-grey-100',
      raised: 'bg-white shadow-raised',
    },
    padding: { none: 'p-0', md: 'p-4', lg: 'p-6' },
  },
  defaultVariants: { variant: 'outline', padding: 'md' },
});

export interface CardProps extends ComponentProps<'div'>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}

export function CardTitle({ className, children, ...props }: ComponentProps<'h3'>) {
  return (
    <h3 className={cn('text-h3 text-black', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-small text-grey-700', className)} {...props} />;
}
