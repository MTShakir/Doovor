import type { Metadata } from 'next';
import { ProgressScreen, type ProgressScreenProps } from './progress-screen';

export const metadata: Metadata = { title: 'Progress' };

/** PRG-03, M4-07, PRD 6.2 "View learner progress: own learners". */
export default function LearnerProgressPage({ params }: Omit<ProgressScreenProps, 'portal'>) {
  return <ProgressScreen params={params} portal="instructor" />;
}
