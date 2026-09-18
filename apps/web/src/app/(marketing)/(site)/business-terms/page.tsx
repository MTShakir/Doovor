import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { ForTheSolicitor, LegalList, LegalPage, LegalSection, LegalTable, LegalText } from '@/components/site/legal';
import { publicPageMetadata } from '@/lib/public/metadata';

/**
 * The terms an instructor or a school agrees to, with the data processing terms inside them
 * (NFR-PRV-02, PRD 15, M6-07). A draft for a solicitor.
 */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Terms for instructors and schools',
    description: `The agreement between your driving business and ${brand.name}, including how we handle your learners' data.`,
    path: '/business-terms',
    indexable: true,
  });
}

export default function BusinessTermsPage() {
  return (
    <LegalPage
      title="Terms for instructors and schools"
      summary="The agreement between your driving business and us, and how we handle the data of the learners you teach."
      updated="18 September 2026"
    >
      <LegalSection title="What you are buying">
        <LegalText>
          {brand.name} is software for running a driving business: a diary, learners, bookings, payments, records and a
          public profile. You teach the lessons and you set your prices. We are not a party to the lessons you teach
          and we are not your employer.
        </LegalText>
      </LegalSection>

      <LegalSection title="What we ask of you">
        <LegalList
          items={[
            'Hold a valid ADI or PDI badge for what you teach, and keep it in date. The app takes a profile out of search when a badge runs out.',
            'Hold the insurance the law and your trade require.',
            'Keep what you tell learners true, including your prices, your hours and what you say on your profile.',
            'Never ask for or leave a false review, and never pay anybody for one.',
            'Never book a DVSA test for a learner through an automated service.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Plans and payment">
        <LegalList
          items={[
            'The free plan stays free. Paid plans are billed monthly or yearly, in advance, and you can stop at the end of a period.',
            'Card payments from your learners are taken on your own Stripe account, not ours, and Stripe pays you directly. We never hold your money.',
            'Card fees are Stripe\u2019s and are shown in full before a payment is taken.',
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please supply the wording for ending a plan, for what happens to data afterwards, for price changes, and
            for what we owe you if the service is unavailable.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Your learners' data">
        <LegalText>
          You decide what you keep about your learners, so you are the controller of it. We hold it for you, so we are
          your processor. This section is our agreement about that.
        </LegalText>
        <LegalTable
          caption="The processing, in the terms the law asks for."
          rows={[
            ['What we do with it', 'We store it, show it to the people in your business who are allowed to see it, and use it to send the reminders and receipts you ask for. Nothing else.'],
            ['Whose data', 'Your learners, and the people who work in your business.'],
            ['What kind', 'Names, contact details, lesson history, progress, payment records, and dates of birth where you record them.'],
            ['How long', 'While your account is open, and afterwards only what the law says must be kept.'],
            ['Who else sees it', 'The companies listed in our privacy notice, each for one job, and nobody else.'],
            ['Where it is', 'The United Kingdom and the European Union.'],
            ['Keeping it safe', 'Every row is walled off by your business. Payments, bookings and records go through checks that cannot be skipped, and who did what is written down.'],
            ['If something goes wrong', 'We tell you without undue delay, with what we know.'],
            ['When you leave', 'We delete it, or give it back, at your choice, except what the law says must be kept.'],
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please turn this into a data processing agreement that meets Article 28 of the UK GDPR, including the
            sub-processor terms, audit rights, notice periods and the international transfer wording.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Your learners are yours">
        <LegalText>
          The learners you bring stay yours. We do not contact them to offer them another instructor, and we do not
          sell what you keep about them.
        </LegalText>
      </LegalSection>

      <LegalSection title="The rest">
        <ForTheSolicitor>
          <p>
            Please supply the wording for liability and its limits, for indemnities, for intellectual property, for
            suspension, for ending the agreement, for changes to these terms, and for which law applies.
          </p>
        </ForTheSolicitor>
      </LegalSection>
    </LegalPage>
  );
}
