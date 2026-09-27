'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const Tabs = TabsPrimitive.Root;

/**
 * Segmented control look: grey track, black selected pill.
 *
 * UX: the selected thing is black wherever it appears (D-211). The diary's Day/Week/Month, the
 * Money screen's periods and the Learners filters were all black already; only this component was
 * white, so the learner card and the progress screens disagreed with the rest of the product about
 * what "chosen" looks like.
 */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-12 items-center gap-1 rounded-full bg-grey-100 p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex h-10 flex-1 items-center justify-center rounded-full px-4 text-small font-semibold text-grey-700 transition-colors duration-200',
        'data-[state=active]:bg-black data-[state=active]:text-white',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4 outline-none', className)} {...props} />;
}
