import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { CookieChoice } from '@/components/analytics/cookie-choice';
import { ForTheSolicitor, LegalPage, LegalSection, LegalTable, LegalText } from '@/components/site/legal';
import { publicPageMetadata } from '@/lib/public/metadata';

/** What is stored on the device, and what waits for a yes (NFR-PRV-02, M6-07, M6-08). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Cookies',
    description: `What ${brand.name} keeps on your device, what it is for, and what waits until you say yes.`,
    path: '/cookies',
    indexable: true,
  });
}

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies"
      summary="What we keep on your device, what each thing is for, and what waits until you say yes."
      updated="18 September 2026"
    >
      <LegalSection title="Your answer">
        <LegalText>
          The things that make signing in work are set whatever you choose, because without them the app cannot know
          who you are. Nothing that counts how the product is used is set until you agree to it, and you can change
          your mind here at any time.
        </LegalText>
        <CookieChoice />
      </LegalSection>

      <LegalSection title="Set whatever you choose">
        <LegalTable
          caption="These make the app work. Turning them off would mean signing in on every page."
          rows={[
            ['Your session', 'Says which account you are signed in as, so the app can show you your own diary. Lasts until you sign out.'],
            ['What you chose about cookies', 'Remembers your answer so you are not asked again.'],
            ['Kept for no signal', 'Your next lessons are kept on your own device so the app works without a connection. It never leaves your device.'],
          ]}
        />
      </LegalSection>

      <LegalSection title="Only after you say yes">
        <LegalTable
          caption="Counting how the product is used. Nothing here is loaded before you agree."
          rows={[
            ['PostHog', 'Counts which screens are used and where people get stuck, so we know what to fix. Held in the European Union.'],
          ]}
        />
        <LegalText>
          You can change your answer at the top of this page. Saying no stops anything further being sent and forgets
          what was kept on this device.
        </LegalText>
      </LegalSection>

      <LegalSection title="Other companies">
        <LegalText>
          Some screens load something from another company to work at all: the card fields come from Stripe, and the
          maps come from Mapbox. Those companies may set something of their own while you are on that screen. We do not
          load either until the screen that needs it is opened.
        </LegalText>
        <ForTheSolicitor>
          <p>
            Please confirm this meets PECR and the ICO guidance on cookie consent, and whether the third party rows
            above need their own consent rather than being treated as strictly necessary on the screens that use them.
          </p>
        </ForTheSolicitor>
      </LegalSection>
    </LegalPage>
  );
}
