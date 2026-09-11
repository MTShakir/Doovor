import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** One action, usually a primary Button. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="flex size-16 items-center justify-center rounded-full bg-grey-100 text-black">
        <Icon size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <h2 className="text-h3 text-black">{title}</h2>
      {description ? <p className="max-w-sm text-small text-grey-700">{description}</p> : null}
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
