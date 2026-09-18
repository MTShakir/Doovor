import { ChevronRight } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ListRowProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  /** Value on the right, for example a price or a status pill. */
  trailing?: ReactNode;
  chevron?: boolean;
  /**
   * Pass one empty link or button as the child to make the whole row tappable:
   * <ListRow asChild title="Sam" chevron><Link href="/learners/1" /></ListRow>
   */
  asChild?: boolean;
}

/** List row with an optional chevron (PRD 7.4). At least 56 px tall. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron = false,
  asChild = false,
  className,
  children,
  ...props
}: ListRowProps) {
  const classes = cn(
    'flex min-h-14 w-full flex-wrap items-center gap-3 px-4 py-2 text-left',
    asChild &&
      'transition-colors duration-200 hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black',
    className,
  );
  const Root = asChild ? Slot.Root : 'div';
  return (
    <Root className={classes} {...props}>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-ink">{title}</span>
        {subtitle ? <span className="truncate text-small text-grey-700">{subtitle}</span> : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 items-center gap-2 text-body text-ink tabular-nums">{trailing}</span>
      ) : null}
      {chevron ? <ChevronRight className="shrink-0 text-grey-700" size={20} strokeWidth={1.5} aria-hidden /> : null}
    </Root>
  );
}

export function ListDivider({ className }: { className?: string }) {
  return <hr className={cn('ml-4 border-grey-200', className)} />;
}
