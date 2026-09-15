import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Status pills from PRD 7.4 with the contrast rules in D-009: green and yellow fills carry
 * black text, red appears as text and outline on white only.
 */
export const statusPillVariants = cva(
  'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption font-semibold whitespace-nowrap',
  {
    variants: {
      status: {
        confirmed: 'bg-black text-white',
        pending: 'bg-grey-100 text-grey-700',
        completed: 'bg-green text-black',
        paid: 'bg-green text-black',
        cancelled: 'bg-grey-100 text-grey-700 line-through',
        /** Something a person has to finish, such as payments that are nearly set up. */
        attention: 'bg-yellow text-black',
        unpaid: 'border border-red bg-white text-red',
        overdue: 'bg-red text-white',
        credit: 'border border-black bg-white text-black',
        'gap-fill': 'bg-yellow text-black',
        'test-day': 'bg-yellow text-black',
      },
    },
    defaultVariants: { status: 'pending' },
  },
);

export type PillStatus = NonNullable<VariantProps<typeof statusPillVariants>['status']>;

const defaultLabels: Record<PillStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  completed: 'Completed',
  paid: 'Paid',
  cancelled: 'Cancelled',
  attention: 'Attention',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  credit: 'Credit',
  'gap-fill': 'Gap Fill offer',
  'test-day': 'Test day',
};

export interface StatusPillProps {
  status: PillStatus;
  /** Override the default label, for example "Paid (cash)" (PAY-05). */
  children?: ReactNode;
  className?: string;
}

export function StatusPill({ status, children, className }: StatusPillProps) {
  return <span className={cn(statusPillVariants({ status }), className)}>{children ?? defaultLabels[status]}</span>;
}
