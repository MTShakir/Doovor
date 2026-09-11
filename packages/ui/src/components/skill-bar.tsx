import { cn } from '../lib/cn';

/** PRG-02 rating scale (PRD Appendix A). */
export const skillRatingLabels = ['Introduced', 'Under full instruction', 'Prompted', 'Seldom prompted', 'Independent'] as const;

export interface SkillBarProps {
  skill: string;
  /** 0 (not yet rated) to 5 */
  rating: number;
  className?: string;
}

/** Five segments filled to the rating, with the rating name (PRD 7.4 Skill bar). */
export function SkillBar({ skill, rating, className }: SkillBarProps) {
  const level = Math.min(5, Math.max(0, Math.round(rating)));
  const levelLabel = level === 0 ? 'Not started' : skillRatingLabels[level - 1];
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body font-medium text-ink">{skill}</span>
        <span className="text-small text-grey-700">{levelLabel}</span>
      </div>
      <div className="flex gap-1" role="img" aria-label={`${skill}: ${String(level)} of 5, ${levelLabel ?? ''}`}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={cn('h-2 flex-1 rounded-full', index < level ? 'bg-black' : 'bg-grey-200')} />
        ))}
      </div>
    </div>
  );
}
