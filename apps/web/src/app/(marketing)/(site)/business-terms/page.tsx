import { brand } from '@repo/config/brand';
import { legalDate, legalDocuments } from '@repo/core/legal';
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
      updated={legalDate(legalDocuments.businessTerms.updated)}
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
            'Ask a learner before you put their pass photograph on your profile, and take it down when they ask. The app records that you confirmed you asked; the asking itself is yours to do, and the photograph is published with their name on a page anybody can read.',
            'A school vouches that every instructor who teaches under it holds a valid badge for what they teach. We remind them when a badge is running out, but we do not check those badges ourselves, and the school is responsible for them.',
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

      <LegalSection title="Working with a school">
        <LegalList
          items={[
            'A school can work with instructors who run a business of their own. Each keeps their business, their learners, their prices and their own Stripe account, and while they work together keeps their prices within the most the school sets.',
            'A school can charge an instructor who works with it a fee every week or every month, and a fee for each pupil it introduces. The app keeps the record and tells you both when a fee is due. It does not collect the fee: you pay it between you as you agreed, and the school marks it paid.',
            'A school can offer a pupil who asked it for lessons to the instructors who work with it. The first to accept gets the pupil’s details, and may use them only to arrange and teach their lessons.',
            'Either of you can stop working together at any time, from the app. Fees already due stay due, and no new ones are raised. The pupils the school introduced are asked whether to go back to it, and nothing moves until they answer.',
            'An instructor with a business of their own who joins a school to teach under it pauses that business: its profile and booking link go offline, and its learners are asked whether to move with them. A business can only pause with no lessons still to come and no hours a learner has paid for and not used. When they leave the school, they open it again.',
            'A school can record what it pays the instructors who teach under it, and the app works out each week from the lessons taught. Paying them, and everything else an employer or a client owes, is the school’s to do, not the app’s.',
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please confirm the wording for fees between a school and the instructors who work with it, including what
            happens to fees owed when either side stops, and whether more is needed about a school’s responsibility for
            the instructors it vouches for and pays.
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
            ['Whose data', 'Your learners, the people who work in your business, and the people who ask your school for lessons.'],
            ['What kind', 'Names, contact details, lesson history, progress, payment records, and dates of birth where you record them.'],
            ['How long', 'While your account is open, and afterwards only what the law says must be kept.'],
            ['Who else sees it', 'The companies listed in our privacy notice, each for one job, and nobody else.'],
            ['Where it is', 'The United Kingdom and the European Union.'],
            ['Keeping it safe', 'Every row is walled off by your business. Payments, bookings and records go through checks that cannot be skipped, and who did what is written down.'],
            ['If something goes wrong', 'We tell you without undue delay, with what we know.'],
            ['When you leave', 'We delete it, or give it back, at your choice, except what the law says must be kept.'],
          ]}
        />
        <LegalText>
          When a school passes a pupil to an instructor who works with it, the school stays the controller of what it
          kept, and the instructor is the controller of what they keep from then on. We are the processor for each of
          them.
        </LegalText>
        <ForTheSolicitor>
          <p>
            Please turn this into a data processing agreement that meets Article 28 of the UK GDPR, including the
            sub-processor terms, audit rights, notice periods and the international transfer wording, and say whether a
            school and the instructors it works with need a data sharing agreement for the pupils it passes on.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Your learners are yours">
        <LegalText>
          The learners you bring stay yours. We do not contact them to offer them another instructor, and we do not
          sell what you keep about them. The one time we ask them anything about it is your own doing: if you join a
          school, or stop working with one that introduced them, we ask whether they want to move, and nothing moves
          until they answer.
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
