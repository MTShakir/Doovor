import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { LegalList, LegalPage, LegalSection, LegalText } from '@/components/site/legal';
import { publicPageMetadata } from '@/lib/public/metadata';

/** How usable the product is, and what is known not to be (PRD 14.4, 15, M6-07). */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Accessibility',
    description: `How accessible ${brand.name} is, how it is tested, what is known not to work yet, and how to tell us about a problem.`,
    path: '/accessibility',
    indexable: true,
  });
}

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility"
      summary="How accessible the app is, how we test it, what we know is not right yet, and how to tell us."
      updated="18 September 2026"
      reviewed="18 September 2026"
    >
      <LegalSection title="What we aim for">
        <LegalText>
          We aim to meet the Web Content Accessibility Guidelines 2.2 at level AA across the public site and every
          screen of the app. As far as we can tell from our own testing, we meet it, with the exceptions listed below.
        </LegalText>
      </LegalSection>

      <LegalSection title="How we test">
        <LegalList
          items={[
            'Every screen is scanned automatically against WCAG 2.2 AA on a phone and on a laptop, on every change. A serious or critical finding stops the change from shipping.',
            'Every screen is opened with the text set to twice its size, and nothing may need scrolling sideways to read.',
            'Every main screen is walked through with the keyboard alone: every control can be reached, every stop can be seen, and one press gets past the navigation to the content.',
            'Colours are checked against the same standard, and a colour is never the only thing that carries a meaning.',
          ]}
        />
        <LegalText>
          Automatic testing cannot find everything. We have not yet had the app tested by disabled people or by an
          independent auditor, and we intend to before we open to everybody.
        </LegalText>
      </LegalSection>

      <LegalSection title="What we know is not right yet">
        <LegalList
          items={[
            'The admin portal, which only our own staff use, asks for a larger screen and does not work on a phone.',
            'Maps are pictures of an area. The same information is given in words beside them, but the map itself cannot be read by a screen reader.',
            'The card fields belong to our payment provider, so how accessible they are is theirs rather than ours.',
            'We have not tested with every screen reader. Our own testing uses the browser, the keyboard and an automatic scan.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Telling us about a problem">
        <LegalText>
          If something on {brand.name} is hard or impossible to use, email {brand.supportEmail} and say which screen
          and what happened. We will reply within five working days and tell you what we are doing about it.
        </LegalText>
      </LegalSection>

      <LegalSection title="How this statement was made">
        <LegalText>
          This statement was written on 18 September 2026. It was made after testing every screen of the product against
          WCAG 2.2 AA, which is described above. It has not been checked by an independent auditor.
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
