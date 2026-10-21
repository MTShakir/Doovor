import type { Metadata } from 'next';
import { LearnerScreen, type LearnerScreenProps } from '@/app/(portal)/app/instructor/learners/[id]/learner-screen';

export const metadata: Metadata = { title: 'Learner' };

/**
 * LRN-02, PRD 6.2: one of the school's learners, as its office sees them, with their lessons booked,
 * moved, called off and marked paid, their money refunded and their progress read (D-330).
 */
export default function SchoolLearnerPage({ params, searchParams }: Omit<LearnerScreenProps, 'portal'>) {
  return <LearnerScreen params={params} searchParams={searchParams} portal="school" />;
}
