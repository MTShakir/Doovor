'use client';

import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { SkeletonRow } from '@repo/ui/skeleton';
import { useEffect, useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LearnerAllocation } from '@/lib/school/allocation';

/**
 * Giving a new pupil to one of the school's own instructors (M9-18, D-289), with the suggestions
 * the school already has for a learner (SCH-03): who teaches their gearbox, covers where they
 * start and has time, best first, and everybody else to choose by hand.
 */
export function GivePupilSheet({
  pupil,
  loadAllocation,
  onGive,
  onClose,
  onGiven,
}: {
  pupil: { enquiryId: string; fullName: string } | null;
  loadAllocation: (enquiryId: string) => Promise<Result<LearnerAllocation>>;
  onGive: (input: { enquiryId: string; instructorId: string }) => Promise<Result<null>>;
  onClose: () => void;
  onGiven: (instructorName: string) => void;
}) {
  const [allocation, setAllocation] = useState<LearnerAllocation | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const enquiryId = pupil?.enquiryId ?? null;

  useEffect(() => {
    if (enquiryId === null) return;
    let current = true;
    void loadAllocation(enquiryId).then((result) => {
      if (!current) return;
      if (result.ok) setAllocation(result.data);
      else setProblem(result.message);
    });
    return () => {
      current = false;
      setAllocation(null);
      setChosen(null);
      setProblem(null);
    };
  }, [enquiryId, loadAllocation]);

  const suggested = new Set(allocation?.suggestions.map((one) => one.instructorId) ?? []);
  const others = (allocation?.everybody ?? []).filter((one) => !suggested.has(one.id));
  const name = [...(allocation?.suggestions ?? []).map((one) => ({ id: one.instructorId, name: one.name })), ...others].find(
    (one) => one.id === chosen,
  )?.name;

  const give = async () => {
    if (pupil === null || chosen === null) return;
    setPending(true);
    const result = await onGive({ enquiryId: pupil.enquiryId, instructorId: chosen });
    setPending(false);
    if (result.ok) onGiven(name ?? 'them');
    else setProblem(result.fields?.instructorId ?? result.message);
  };

  const choice = (id: string, label: string, reasons?: readonly string[]) => (
    <li key={id}>
      <label
        className={`flex min-h-12 cursor-pointer flex-col gap-1 rounded-card border p-3 ${chosen === id ? 'border-black' : 'border-grey-200'}`}
      >
        <span className="flex items-center gap-3">
          <input
            type="radio"
            name="give-to"
            className="size-5 accent-black"
            checked={chosen === id}
            onChange={() => { setChosen(id); }}
          />
          <span className="text-body font-semibold text-black">{label}</span>
        </span>
        {reasons && reasons.length > 0 ? <span className="pl-8 text-small text-grey-700">{reasons.join('. ')}.</span> : null}
      </label>
    </li>
  );

  return (
    <Sheet
      open={pupil !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Give ${pupil?.fullName ?? 'this pupil'} to an instructor`}
      description="They become one of your learners, with that instructor."
      footer={
        <Button width="full" pending={pending} disabled={chosen === null} onClick={() => { void give(); }}>
          {name === undefined ? 'Give to an instructor' : `Give to ${name}`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {problem ? <FormAlert>{problem}</FormAlert> : null}
        {allocation === null && problem === null ? <SkeletonRow /> : null}
        {allocation !== null ? (
          <>
            {allocation.suggestions.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-small font-semibold text-ink">Suggested</legend>
                <ul className="flex flex-col gap-2">{allocation.suggestions.map((one) => choice(one.instructorId, one.name, one.reasons))}</ul>
              </fieldset>
            ) : (
              <p className="text-small text-grey-700">Nobody stands out for their gearbox, area and free time. Choose anybody below.</p>
            )}
            {others.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-small font-semibold text-ink">Everybody else</legend>
                <ul className="flex flex-col gap-2">{others.map((one) => choice(one.id, one.name))}</ul>
              </fieldset>
            ) : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
