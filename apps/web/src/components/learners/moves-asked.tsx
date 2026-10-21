'use client';

import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill, type PillStatus } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Fragment, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { MoveAsked } from '@/lib/learners/moves';

const answers: Record<MoveAsked['status'], { pill: PillStatus; label: string }> = {
  asked: { pill: 'attention', label: 'Not answered yet' },
  moved: { pill: 'completed', label: 'Moved' },
  stayed: { pill: 'pending', label: 'Staying' },
};

function stillToAnswer(count: number): string {
  if (count === 0) return 'Everybody has answered.';
  return count === 1 ? '1 has still to answer.' : `${String(count)} have still to answer.`;
}

/**
 * The learners an instructor's own Business asked to move with them to the school they joined,
 * and how each answered (M9-23, D-292, D-322). A learner who has never signed in cannot answer
 * here, so the instructor asks them and says what they chose.
 */
export function MovesAskedCard({
  moves,
  answer,
  idPrefix = '',
}: {
  moves: MoveAsked[];
  answer: (input: { moveId: string; move: boolean }) => Promise<Result<null>>;
  idPrefix?: string;
}) {
  const [answering, setAnswering] = useState<MoveAsked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = moves[0];
  if (first === undefined) return null;
  const titleId = `${idPrefix}moves-asked-title`;
  const waiting = moves.filter((one) => one.status === 'asked').length;

  const give = (move: boolean) => {
    if (answering === null) return;
    const { moveId, learnerName } = answering;
    setError(null);
    startTransition(async () => {
      const result = await answer({ moveId, move });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAnswering(null);
      toast(move ? `${learnerName} is moving with you` : `${learnerName} is staying`);
    });
  };

  return (
    <Card padding="none" role="region" aria-labelledby={titleId}>
      <div className="flex flex-col gap-1 px-4 pt-4 pb-2">
        <CardTitle id={titleId}>Asked to move with you</CardTitle>
        <CardDescription>
          Your learners at {first.fromName} were asked whether to move to {first.toName} with you. Moving is their choice.{' '}
          {stillToAnswer(waiting)}
        </CardDescription>
      </div>
      {moves.map((one, index) => {
        const forThem = one.status === 'asked' && !one.canAnswer;
        return (
          <Fragment key={one.moveId}>
            {index === 0 ? null : <ListDivider />}
            <ListRow
              title={one.learnerName}
              subtitle={forThem ? 'Has never signed in' : undefined}
              trailing={
                forThem ? (
                  <Button variant="secondary" onClick={() => { setError(null); setAnswering(one); }}>
                    Answer for them
                  </Button>
                ) : (
                  <StatusPill status={answers[one.status].pill}>{answers[one.status].label}</StatusPill>
                )
              }
            />
          </Fragment>
        );
      })}
      <Sheet
        open={answering !== null}
        onOpenChange={(open) => { if (!open) setAnswering(null); }}
        title={answering === null ? '' : `Is ${answering.learnerName} moving to ${answering.toName}?`}
        description={
          answering === null
            ? undefined
            : `${answering.learnerName} has never signed in, so cannot answer here. Ask them, then say what they chose. Only say they are moving once they have agreed.`
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Button width="responsive" pending={pending} onClick={() => { give(true); }}>
            Moving with me
          </Button>
          <Button variant="secondary" width="responsive" disabled={pending} onClick={() => { give(false); }}>
            Staying
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
