import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { BackLink } from '@/components/back-link';
import { ComingSoonFeature } from '@/components/coming-soon-feature';

export const metadata: Metadata = { title: 'Messages' };

/**
 * D-116, D-209, D-212: the Free plan's next thing, said and not sold.
 *
 * Nothing on this screen is Pro, so it carries the "Every plan" mark rather than the Pro tag: it
 * sits between two Pro rows in the menu and would otherwise read as a third one.
 */
export default function MessagesPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/instructor/more">More</BackLink>
      <PageHeader title="Messages" subtitle="Everything a learner said, in one place." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <ComingSoonFeature
          feature="Messages"
          plan="Free"
          description="In-app chat with your learners, so running a lesson does not mean four WhatsApp threads and a text you cannot find."
          willDo={[
            'One thread per learner, with their lessons and payments beside it',
            'A message about a lesson opens the lesson, so you are never guessing which one they mean',
            'Your phone number stays yours: learners message you in the app, not on it',
            'Read on your phone and answered on your laptop, because it is the same thread in both',
          ]}
        />
      </div>
    </main>
  );
}
