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
  /** 1 where it is all a page has to say, such as a link that leads nowhere; otherwise 2, inside a page. */
  headingLevel?: 1 | 2;
}

export function EmptyState({ icon: Icon, title, description, action, className, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}>
      <span className="flex size-16 items-center justify-center rounded-full bg-quiet text-black">
        <Icon size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <Heading className="text-h3 text-black">{title}</Heading>
      {description ? <p className="max-w-sm text-small text-grey-700">{description}</p> : null}
      {action ? <div className="mt-2 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
