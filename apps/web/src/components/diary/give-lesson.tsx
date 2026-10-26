'use client';

import { gearboxReason } from '@repo/core/allocation';
import { formatDate, formatTime } from '@repo/core/time';
import { Sheet } from '@repo/ui/sheet';
import { SkeletonRow } from '@repo/ui/skeleton';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { coverChoices, giveLesson, type CoverChoice } from '@/app/(portal)/app/instructor/booking-actions';

/** Why somebody at the school cannot take the lesson, in words. */
const cannot: Record<string, string> = {
  SLOT_TAKEN: 'Busy then',
  LEARNER_BUSY: 'The learner has another lesson then',
  PDI_NOT_LINKED: 'A trainee nobody supervises yet',
  BUSINESS_SUSPENDED: 'Not taking lessons',
};

function choiceWords(choice: CoverChoice): string {
  const gearbox = choice.transmission === null ? null : gearboxReason(choice.transmission);
  const when = choice.problem === null ? 'Free then' : (cannot[choice.problem] ?? 'Cannot take it');
  return gearbox === null ? when : `${when}. ${gearbox}`;
}

/**
 * Who at the school could teach a lesson instead (D-397): free ones first, and each who cannot
 * saying why, and not to be chosen. Null while the list is on its way.
 */
export function CoverChoiceList({
  choices,
  giving,
  disabled,
  onChoose,
}: {
  choices: CoverChoice[] | null;
  /** The one being given it now. */
  giving: string | null;
  disabled: boolean;
  onChoose: (choice: CoverChoice) => void;
}) {
  if (choices === null) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (choices.length === 0) return <p className="text-small text-grey-700">Nobody else teaches under the school yet.</p>;
  return (
    <ul className="flex flex-col gap-1" aria-label="Instructors at the school">
      {choices.map((choice) => (
        <li key={choice.instructorId}>
          <button
            type="button"
            disabled={choice.problem !== null || disabled}
            aria-busy={giving === choice.instructorId}
            onClick={() => { onChoose(choice); }}
            className="flex min-h-14 w-full flex-col gap-1 rounded-card px-4 py-3 text-left hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black disabled:opacity-60"
          >
            <span className="text-body font-semibold text-black">{choice.name}</span>
            <span className="text-small text-grey-700">{giving === choice.instructorId ? 'Giving it to them' : choiceWords(choice)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The school's office gives a lesson still to come to another of its instructors (SCH-02, D-120,
 * D-397): somebody covering for an instructor who is ill, away or switched off. The database
 * checks again.
 */
export function GiveLessonSheet({
  lesson,
  onClose,
}: {
  lesson: { bookingId: string; learnerName: string; startsAt: string; instructorName?: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const [choices, setChoices] = useState<CoverChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [giving, setGiving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const when = new Date(lesson.startsAt);

  useEffect(() => {
    let current = true;
    void coverChoices({ bookingId: lesson.bookingId }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.message);
        setChoices([]);
        return;
      }
      setChoices(result.data);
    });
    return () => {
      current = false;
    };
  }, [lesson.bookingId]);

  const give = (choice: CoverChoice) => {
    setError(null);
    setGiving(choice.instructorId);
    startTransition(async () => {
      const result = await giveLesson({ bookingId: lesson.bookingId, instructorId: choice.instructorId });
      setGiving(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast(`${lesson.learnerName}'s lesson is with ${choice.name} now`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Sheet
      open
      onOpenChange={onClose}
      title="Who teaches it instead?"
      description={`${formatDate(when)} at ${formatTime(when)}${lesson.instructorName ? `, with ${lesson.instructorName} now` : ''}. ${lesson.learnerName} and both instructors are told.`}
    >
      <div className="flex flex-col gap-3 pb-2">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <CoverChoiceList choices={choices} giving={giving} disabled={pending} onChoose={give} />
      </div>
    </Sheet>
  );
}
