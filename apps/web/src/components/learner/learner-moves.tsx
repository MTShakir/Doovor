'use client';

import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { toast } from '@repo/ui/toast';
import { useState } from 'react';
import type { LearnerMove } from '@/lib/learners/moves';

/** What a move is, in the learner's words, and the two answers (D-292). */
function words(move: LearnerMove): { title: string; body: string; yes: string; no: string } {
  if (move.reason === 'joined_school') {
    const who = move.instructorName ?? 'Your instructor';
    return {
      title: `${who} now teaches for ${move.toName}`,
      body: `Move to ${move.toName} to keep learning with them. The lessons you have had stay on your record.`,
      yes: `Move to ${move.toName}`,
      no: 'Not now',
    };
  }
  return {
    title: `${move.fromName} no longer works with ${move.toName}`,
    body: `${move.toName} introduced you. You can go back to it and it will find you an instructor, or keep learning with ${move.fromName}.`,
    yes: `Go back to ${move.toName}`,
    no: `Stay with ${move.fromName}`,
  };
}

/**
 * The learner chooses (M9-23, M9-24, D-292): moving is always theirs to decide, and nothing moves
 * until they do.
 */
export function LearnerMoves({
  moves,
  onAnswer,
  onAnswered,
}: {
  moves: readonly LearnerMove[];
  onAnswer: (input: { moveId: string; move: boolean }) => Promise<Result<null>>;
  onAnswered: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (moves.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {moves.map((move) => {
        const said = words(move);
        const answer = async (yes: boolean) => {
          setBusy(move.moveId);
          const result = await onAnswer({ moveId: move.moveId, move: yes });
          setBusy(null);
          toast(result.ok ? (yes ? `Moved to ${move.toName}` : 'Kept as it is') : result.message);
          onAnswered();
        };
        return (
          <Card key={move.moveId} className="flex flex-col gap-3" role="region" aria-labelledby={`move-${move.moveId}`}>
            <div className="flex flex-col gap-1">
              <CardTitle id={`move-${move.moveId}`}>{said.title}</CardTitle>
              <CardDescription>{said.body}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button pending={busy === move.moveId} onClick={() => { void answer(true); }}>
                {said.yes}
              </Button>
              <Button variant="secondary" disabled={busy === move.moveId} onClick={() => { void answer(false); }}>
                {said.no}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
