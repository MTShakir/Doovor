'use client';

import { initialsFor } from '@repo/core/public-profile';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check } from 'lucide-react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { cn } from '../lib/cn';

const avatarVariants = cva('relative inline-flex shrink-0', {
  variants: {
    size: { sm: 'size-8', md: 'size-10', lg: 'size-14', xl: 'size-24' },
  },
  defaultVariants: { size: 'md' },
});

const tickSize = { sm: 'size-3.5', md: 'size-4', lg: 'size-5', xl: 'size-7' } as const;
const initialsSize = { sm: 'text-caption', md: 'text-small', lg: 'text-body', xl: 'text-h2' } as const;

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name: string;
  src?: string | null;
  /** Shows the blue Verified tick (INS-02). Blue is reserved for this and links (PRD 7.2). */
  verified?: boolean;
  /** The name is written beside it, so it is a picture and not read out a second time. */
  decorative?: boolean;
  className?: string;
}

export function Avatar({ name, src, verified = false, decorative = false, size, className }: AvatarProps) {
  const key = size ?? 'md';
  return (
    <span className={cn(avatarVariants({ size }), className)} aria-hidden={decorative || undefined}>
      <AvatarPrimitive.Root className="flex size-full overflow-hidden rounded-full bg-grey-100">
        {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
        <AvatarPrimitive.Fallback
          className={cn('flex size-full items-center justify-center font-semibold text-ink', initialsSize[key])}
          delayMs={src ? 300 : 0}
        >
          <span aria-hidden>{initialsFor(name)}</span>
          {decorative ? null : <span className="sr-only">{name}</span>}
        </AvatarPrimitive.Fallback>
      </AvatarPrimitive.Root>
      {verified ? (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-blue text-white ring-2 ring-white',
            tickSize[key],
          )}
          role="img"
          aria-label="Verified instructor"
        >
          <Check className="size-3/4" strokeWidth={3} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}
