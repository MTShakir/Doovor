import { Star } from 'lucide-react';
import { cn } from '../lib/cn';

export interface RatingStarsProps {
  /** 0 to 5, halves allowed */
  rating: number;
  count?: number;
  className?: string;
}

/** Read-only star rating (PRD 7.4). Reviews themselves arrive in Phase 2 (REV-01). */
export function RatingStars({ rating, count, className }: RatingStarsProps) {
  const value = Math.min(5, Math.max(0, rating));
  const label = `${value.toFixed(1)} out of 5${count === undefined ? '' : `, ${String(count)} reviews`}`;
  return (
    <span className={cn('inline-flex items-center gap-1', className)} role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, index) => {
        const fill = Math.min(1, Math.max(0, value - index));
        return (
          <span key={index} className="relative inline-flex size-4" aria-hidden>
            <Star className="absolute inset-0 text-grey-400" size={16} strokeWidth={1.5} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${String(fill * 100)}%` }}>
              <Star className="fill-black text-black" size={16} strokeWidth={1.5} />
            </span>
          </span>
        );
      })}
      {count === undefined ? null : <span className="ml-1 text-small text-grey-700 tabular-nums">({count})</span>}
    </span>
  );
}
