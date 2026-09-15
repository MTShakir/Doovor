'use client';

import { skillRatingLabels, skillRatings, type SkillRating } from '@repo/core/skills';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';

export interface RatingScaleProps {
  /** What is being rated, which names the group: "Junctions". */
  label: string;
  value: SkillRating | null;
  onChange: (value: SkillRating) => void;
  className?: string;
}

/**
 * Rating one skill from 1 to 5 (PRG-01, PRG-02). Five buttons in a row, each a 48 px target, with
 * the name of the chosen level under them so a tap reads back as words. A radio group: Tab reaches
 * it once and the arrow keys move along it.
 */
export function RatingScale({ label, value, onChange, className }: RatingScaleProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // The chosen button takes the group's tab stop, or the first when nothing is chosen yet.
  const tabStop = value ?? 1;

  const move = (event: KeyboardEvent<HTMLButtonElement>, rating: SkillRating) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (((rating - 1 + step + 5) % 5) + 1) as SkillRating;
    onChange(next);
    buttons.current[next - 1]?.focus();
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div role="radiogroup" aria-label={`${label}, from 1 to 5`} className="grid grid-cols-5 gap-1.5">
        {skillRatings.map((rating) => {
          const chosen = value === rating;
          return (
            <button
              key={rating}
              ref={(element) => {
                buttons.current[rating - 1] = element;
              }}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={`${String(rating)}, ${skillRatingLabels[rating]}`}
              tabIndex={rating === tabStop ? 0 : -1}
              onClick={() => { onChange(rating); }}
              onKeyDown={(event) => { move(event, rating); }}
              className={cn(
                'h-12 rounded-input text-body font-semibold tabular-nums transition-colors duration-200 ease-out',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
                chosen ? 'bg-black text-white' : 'bg-grey-100 text-black hover:bg-grey-200',
              )}
            >
              {rating}
            </button>
          );
        })}
      </div>
      <span className="text-small text-grey-700" aria-hidden>
        {value === null ? 'Not rated yet' : skillRatingLabels[value]}
      </span>
    </div>
  );
}
