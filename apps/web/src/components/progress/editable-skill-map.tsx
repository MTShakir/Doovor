'use client';

import { joinWords } from '@repo/core/public-profile';
import type { Result } from '@repo/core/result';
import { skillMapSummary, type SkillProgress } from '@repo/core/skill-map';
import { skillRatingLabels, type SkillRating } from '@repo/core/skills';
import { Button } from '@repo/ui/button';
import { RatingScale } from '@repo/ui/rating-scale';
import { Sheet } from '@repo/ui/sheet';
import { SkillBar } from '@repo/ui/skill-bar';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';

/** Saves one area's rating: the page hands in its action, the design page a stand-in. */
export type RateSkill = (input: { learnerId: string; skillCode: string; rating: SkillRating }) => Promise<Result<null>>;

/**
 * A learner's skill map as their instructor sees it (PRG-02, PRG-03, D-169): every area of the
 * test report, and each one a tap away from being set by hand, straight from the map, without a
 * lesson's record. The learner sees what is set on their own map.
 */
export function EditableSkillMap({
  learnerId,
  learnerName,
  progress,
  save: rate,
}: {
  learnerId: string;
  learnerName: string;
  progress: SkillProgress[];
  save: RateSkill;
}) {
  const [editing, setEditing] = useState<SkillProgress | null>(null);
  const [rating, setRating] = useState<SkillRating | null>(null);
  const [pending, startTransition] = useTransition();
  const firstName = learnerName.split(' ')[0] ?? learnerName;

  const open = (one: SkillProgress) => {
    setEditing(one);
    setRating(one.rating);
  };

  const save = () => {
    if (!editing || rating === null) return;
    const area = editing.area;
    startTransition(async () => {
      const result = await rate({ learnerId, skillCode: area.code, rating });
      if (!result.ok) {
        toast(result.message);
        return;
      }
      setEditing(null);
      toast(`${area.name}: ${skillRatingLabels[rating]}`);
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-card border border-grey-200 bg-white p-4">
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-ink">{skillMapSummary(progress)}</p>
        <p className="text-small text-grey-700">Tap an area to set where {firstName} is with it.</p>
      </div>
      <ul aria-label="Skill map" className="flex flex-col gap-1">
        {progress.map((one) => (
          <li key={one.area.code}>
            <button
              type="button"
              aria-label={`Change ${one.area.name}, now ${one.rating === null ? 'not started' : skillRatingLabels[one.rating]}`}
              className="w-full cursor-pointer rounded-input p-2 text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              onClick={() => { open(one); }}
            >
              <SkillBar skill={one.area.name} rating={one.rating} />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={editing !== null}
        onOpenChange={(isOpen) => { if (!isOpen) setEditing(null); }}
        title={editing?.area.name ?? 'Skill'}
        description={`Where ${firstName} is with it now. It shows on their progress too.`}
        footer={
          <Button width="full" size="lg" pending={pending} disabled={rating === null} onClick={save}>
            Save
          </Button>
        }
      >
        {editing ? (
          <div className="flex flex-col gap-4">
            <RatingScale label={editing.area.name} value={rating} onChange={setRating} />
            {editing.area.subSkills.length > 0 ? (
              <p className="text-small text-grey-700">It covers {joinWords(editing.area.subSkills.map((sub) => sub.toLowerCase()))}.</p>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
