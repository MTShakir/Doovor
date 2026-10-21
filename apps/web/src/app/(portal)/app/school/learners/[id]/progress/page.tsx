import type { Metadata } from 'next';
import { ProgressScreen, type ProgressScreenProps } from '@/app/(portal)/app/instructor/learners/[id]/progress/progress-screen';

export const metadata: Metadata = { title: 'Progress' };

/** PRG-03, PRD 6.2 "View learner progress": one of the school's learners, read by its office (D-330). */
export default function SchoolLearnerProgressPage({ params }: Omit<ProgressScreenProps, 'portal'>) {
  return <ProgressScreen params={params} portal="school" />;
}
