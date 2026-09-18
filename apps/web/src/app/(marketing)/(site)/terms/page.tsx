import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { ForTheSolicitor, LegalList, LegalPage, LegalSection, LegalText } from '@/components/site/legal';
import { publicPageMetadata } from '@/lib/public/metadata';

/** The terms a learner agrees to (NFR-PRV-02, PRD 15, M6-07). A draft for a solicitor. */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Terms for learners',
    description: `The agreement between you and ${brand.name} when you book and pay for driving lessons through the app.`,
    path: '/terms',
    indexable: true,
  });
}

export default function LearnerTermsPage() {
  return (
    <LegalPage
      title="Terms for learners"
      summary="What you agree to when you book and pay for lessons through the app, and what we agree to."
      updated="18 September 2026"
    >
      <LegalSection title="Who your lesson is with">
        <LegalText>
          Your lesson is with your instructor or your driving school, not with us. They set their prices, their hours
          and their rules about cancelling, and they teach you. {brand.name} is the app they use to run it: the diary,
          the booking, the payment and the record of what you have learned.
        </LegalText>
      </LegalSection>

      <LegalSection title="Booking and cancelling">
        <LegalList
          items={[
            'A booking is made when the app says it is, and you will see it in your lessons straight away.',
            'Each Business sets how long before a lesson you may cancel without paying for it. The app shows you that window before you confirm, and again when you cancel.',
            'If your instructor cancels, you pay nothing and anything you have paid for that lesson comes back to you.',
            'If you do not turn up, the Business may charge you for the lesson, and the app will say so before it does.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Your right to change your mind">
        <LegalText>
          Because you are buying at a distance, you normally have 14 days to change your mind. If you want your lessons
          to start inside those 14 days you have to ask for that, and the app asks you to tick a box saying so before
          it takes any money. If you then cancel inside the 14 days, you pay for what you have already had.
        </LegalText>
        <ForTheSolicitor>
          <p>
            Please check this against the Consumer Contracts (Information, Cancellation and Additional Charges)
            Regulations 2013, including the wording of the tick box, and supply the model cancellation form if one is
            needed.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Paying, and packages">
        <LegalList
          items={[
            'You can pay for a lesson by card, or your Business may let you pay in cash or by bank transfer and record it.',
            'A package is hours bought in advance with one Business. The hours are for lessons with that Business only, they are not money held by us, and they last a year from the day you buy them.',
            'Every price you see includes everything you will pay. There are no fees added at the end.',
            'A receipt is sent for every payment, and all of them are on your payments screen.',
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please confirm the refund terms for a package, what happens to unused hours if a Business stops trading,
            and whether the year limit is enforceable.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="What we ask of you">
        <LegalList
          items={[
            'Be old enough to hold a provisional licence for what you are learning to drive.',
            'Tell your instructor the truth about your licence and your driving.',
            'Treat your instructor and anybody else on the app decently.',
            'Do not use the app to book a driving test. We never book a DVSA test, and neither may anybody else on your behalf through us.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Reviews">
        <LegalText>
          A review can only be left by somebody who has had a lesson with that instructor, and nobody is paid or given
          anything for leaving one. We do not write reviews, and we do not remove one for being unflattering.
        </LegalText>
      </LegalSection>

      <LegalSection title="If something goes wrong">
        <ForTheSolicitor>
          <p>
            Please supply the wording for liability, for how a complaint is handled and escalated, for ending the
            agreement, for changes to these terms, and for which law applies and which courts decide.
          </p>
        </ForTheSolicitor>
      </LegalSection>
    </LegalPage>
  );
}
