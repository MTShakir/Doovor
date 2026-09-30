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
      updated="30 September 2026"
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
            'Your instructor may change when a lesson is, or how long it runs. If the length changes, what you paid for the old length comes back to you and the new length is charged at the price that Business has set for it, so you never pay for time you did not have.',
            'If you do not turn up, your instructor may record it half an hour after the lesson was due to start, and the Business may charge you for it under the same rule as a late cancellation. You can dispute it for seven days afterwards, from your own lessons, and the app will say so before it charges you.',
            'Where you have credit with a Business, a booking uses what it covers and you pay the rest the usual way. If the lesson is called off, each part comes back the way it came: the minutes to your balance and the money to you.',
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

      <LegalSection title="A photograph of the day you passed">
        <LegalText>
          Your instructor may ask to put a photograph of you on their public profile after you pass, with your first
          name and the date. It is up to you, and nobody may publish it without asking: your instructor has to confirm
          to us that they have your permission. You can change your mind at any time. Ask your instructor to take it
          down, or ask us at {brand.supportEmail} and we will, whatever they say.
        </LegalText>
        <ForTheSolicitor>
          <p>
            Please confirm that consent recorded by the instructor is enough here, or whether the learner must give it
            to us directly, and say what wording the instructor should be required to use when they ask.
          </p>
        </ForTheSolicitor>
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
