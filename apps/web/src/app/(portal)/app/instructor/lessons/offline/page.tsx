import type { Metadata } from 'next';
import { KeptLessonScreen } from '@/components/offline/kept-lesson';

export const metadata: Metadata = { title: 'Lesson', robots: { index: false } };

/**
 * Any lesson the phone keeps, drawn on the phone (PRG-09, M4-10). Kept for no signal when Today
 * opens, and where the service worker sends a lesson whose own screen was never kept.
 */
export default function KeptLessonPage() {
  return (
    <main className="flex flex-col pb-8">
      <KeptLessonScreen />
    </main>
  );
}
