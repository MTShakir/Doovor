import type { Metadata } from 'next';
import { LearnerScreen, type LearnerScreenProps } from './learner-screen';

export const metadata: Metadata = { title: 'Learner' };

/** LRN-02: one learner, everything about them an instructor needs before a lesson. */
export default function LearnerPage({ params, searchParams }: Omit<LearnerScreenProps, 'portal'>) {
  return <LearnerScreen params={params} searchParams={searchParams} portal="instructor" />;
}
