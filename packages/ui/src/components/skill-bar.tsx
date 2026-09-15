import { skillRatingLabels, type SkillRating } from '@repo/core/skills';
import { cn } from '../lib/cn';

export interface SkillBarProps {
  /** The area: "Junctions". */
  skill: string;
  /** Its rating, or null for an area not started yet. */
  rating: SkillRating | null;
  className?: string;
}

/**
 * Five segments filled to a rating, with the rating's name (PRD 7.4 Skill bar, PRG-02, PRG-03).
 * Read out once, as a whole: "Junctions: 4 of 5, Seldom prompted".
 */
export function SkillBar({ skill, rating, className }: SkillBarProps) {
  const level = rating ?? 0;
  const levelLabel = rating === null ? 'Not started' : skillRatingLabels[rating];
  return (
    <div role="img" aria-label={`${skill}: ${String(level)} of 5, ${levelLabel}`} className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body font-medium text-ink">{skill}</span>
        <span className="shrink-0 text-small text-grey-700">{levelLabel}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={cn('h-2 flex-1 rounded-full', index < level ? 'bg-black' : 'bg-grey-200')} />
        ))}
      </div>
    </div>
  );
}
