import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { ComingSoonFeature } from '@/components/coming-soon-feature';

export const metadata: Metadata = { title: 'Your booking colours' };

/** D-116, D-209: on the way, and said so rather than sold. */
export default function BookingColoursPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Your booking colours" subtitle="Your booking page in your own colours." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <ComingSoonFeature
          feature="Your own colours"
          description="Your booking page and your public profile in the colours of your own business, rather than ours."
          willDo={[
            'Your colour on the buttons and the headings a learner sees',
            'Your logo at the top of your booking page',
            'Checked for contrast before it goes live, so your page stays readable',
          ]}
        />
      </div>
    </main>
  );
}
