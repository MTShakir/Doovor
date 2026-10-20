'use client';

import { useRouter } from 'next/navigation';
import { LearnerMoves } from '@/components/learner/learner-moves';
import type { LearnerMove } from '@/lib/learners/moves';
import { answerMove } from './move-actions';

/** The learner's choices, with their own answers behind them (D-292). */
export function Moves({ moves }: { moves: LearnerMove[] }) {
  const router = useRouter();
  return <LearnerMoves moves={moves} onAnswer={answerMove} onAnswered={() => { router.refresh(); }} />;
}
