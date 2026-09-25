import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { ComingSoonFeature } from '@/components/coming-soon-feature';

export const metadata: Metadata = { title: 'Calendar sync' };

/** D-116, D-209: on the way, and said so rather than sold. */
export default function CalendarSyncPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Calendar sync" subtitle="Your lessons in the calendar you already live in." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <ComingSoonFeature
          feature="Calendar sync"
          description="Your diary in Google Calendar or Outlook, so the rest of your life and your lessons are in one place."
          willDo={[
            'Every lesson in your own calendar, kept up to date when one moves or is cancelled',
            'Your own appointments read back, so nobody books you while you are somewhere else',
            'A calendar of your own choosing, not a second one we make you check',
          ]}
        />
      </div>
    </main>
  );
}
