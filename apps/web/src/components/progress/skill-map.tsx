import { skillMapSummary, type SkillProgress } from '@repo/core/skill-map';
import { SkillBar } from '@repo/ui/skill-bar';

/**
 * A learner's skill map (PRG-02, PRG-03, M4-07): every area of the test report in its order, each
 * at its rating from the latest lesson that rated it, so what is left to learn shows as plainly
 * as what is done.
 */
export function SkillMap({ progress }: { progress: SkillProgress[] }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-grey-200 bg-white p-4">
      <p className="text-body font-medium text-ink">{skillMapSummary(progress)}</p>
      <ul aria-label="Skill map" className="flex flex-col gap-4">
        {progress.map((one) => (
          <li key={one.area.code}>
            <SkillBar skill={one.area.name} rating={one.rating} />
          </li>
        ))}
      </ul>
    </div>
  );
}
