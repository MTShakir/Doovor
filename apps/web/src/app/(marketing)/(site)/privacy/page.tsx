import { brand } from '@repo/config/brand';
import type { Metadata } from 'next';
import { ForTheSolicitor, LegalList, LegalPage, LegalSection, LegalTable, LegalText } from '@/components/site/legal';
import { publicPageMetadata } from '@/lib/public/metadata';

/** What we hold and why (NFR-PRV-01, NFR-PRV-02, PRD 15, M6-07). A draft for a solicitor. */
export function generateMetadata(): Metadata {
  return publicPageMetadata({
    title: 'Privacy notice',
    description: `What ${brand.name} holds about you, why, where it is kept and what you can ask us to do with it.`,
    path: '/privacy',
    indexable: true,
  });
}

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      summary={`What ${brand.name} holds about you, why we hold it, where it is kept and what you can ask us to do with it.`}
      updated="18 September 2026"
    >
      <LegalSection title="Who is responsible">
        <LegalText>
          {brand.name} is run by {brand.legalEntity}. Two different things happen on it, and who is responsible
          differs between them.
        </LegalText>
        <LegalList
          items={[
            'When a driving instructor or a school uses the app to run their own business, they decide what they keep about their learners. They are the controller of that, and we hold it for them as their processor.',
            'When somebody searches for lessons, looks at a public profile or creates an account, we decide what we keep. We are the controller of that.',
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please confirm the controller and processor split above, give the registered company details and ICO
            registration number to print here, and say whether a representative or data protection officer must be
            named.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="What we hold">
        <LegalTable
          caption="Everything the product stores today."
          rows={[
            ['Your account', 'Name, email address, mobile number, password (stored only as a hash), and the dates you signed in.'],
            ['Instructors and schools', 'Business name, the area you cover, your working hours, your prices, your car, the languages you teach in, and your ADI or PDI badge number and its expiry date.'],
            ['Learners', 'Who teaches you, your lessons, what you have paid, your progress against the DVSA syllabus, and your date of birth where a Business asks for it so it knows whether you are under 18.'],
            ['Lessons and money', 'Bookings, cancellations, payments, refunds, receipts and credit. Card numbers are never sent to us: the card fields belong to Stripe and the card goes straight to them.'],
            ['Pictures', 'A profile photograph if you add one, and a picture of a badge or a licence while it is being checked.'],
            ['Notes', 'An instructor can write private notes about a learner. Those are theirs, and no learner sees them.'],
            ['What the app did', 'An audit trail of the things that matter: who signed in, who changed a role, who saw a learner, who took a payment.'],
          ]}
        />
      </LegalSection>

      <LegalSection title="Why we hold it">
        <LegalList
          items={[
            'To run the service you asked for: your diary, your bookings, your payments and your progress. That is our contract with you.',
            'To keep the service safe and working: sign in, rate limits, the audit trail, and finding out what went wrong when something breaks. That is our legitimate interest, and yours.',
            'To meet the law: financial records for HMRC, and the checks that say an instructor is who they say they are.',
            'To count how the product is used, but only once you have said yes to it. Nothing is counted before that.',
          ]}
        />
        <ForTheSolicitor>
          <p>Please confirm the lawful basis for each row, and the wording for the legitimate interests assessment.</p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Where it is kept">
        <LegalText>
          Everything is held in the United Kingdom or the European Union. The database, the files and the accounts are
          in London. The app itself runs in London. Errors and usage go to services in the European Union.
        </LegalText>
        <LegalTable
          caption="The companies that hold something on our behalf."
          rows={[
            ['Supabase', 'The database, sign in, and the files people upload. London.'],
            ['Vercel', 'Runs the app itself. London.'],
            ['Stripe', 'Card payments and payouts. Stripe holds the card details; we never see them.'],
            ['Resend', 'Sends email.'],
            ['Twilio', 'Sends text messages, including sign in codes.'],
            ['Mapbox', 'Draws the maps of the area an instructor covers.'],
            ['PostHog', 'Counts how the product is used, once you have agreed. European Union.'],
            ['Sentry', 'Records errors so we can fix them. European Union.'],
            ['Inngest', 'Runs the jobs behind reminders and receipts.'],
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please check this list against the processing agreements in place, add any transfer wording needed where a
            company is outside the United Kingdom, and say whether the list belongs here or in a separate register.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalList
          items={[
            'Your account and what is in it: while your account is open.',
            'Financial records: six years, because HMRC requires it. When an account is deleted these are kept but the person behind them is removed.',
            'The audit trail: two years.',
            'Pictures of a badge or a licence: removed once the check is done.',
          ]}
        />
        <ForTheSolicitor>
          <p>Please confirm each period, and whether anything else must be kept for a set time.</p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="What you can ask for">
        <LegalText>
          You can ask for a copy of what we hold, ask us to correct it, ask us to delete it, or object to what we do
          with it. Everything about you can be downloaded from your account, and your account can be deleted from the
          same screen. Where a Business is the controller, ask them first and we will help them answer.
        </LegalText>
        <LegalText>
          If you are not happy with how we have answered, you can complain to the Information Commissioner at ico.org.uk.
        </LegalText>
      </LegalSection>

      <LegalSection title="Children">
        <LegalText>
          A learner may be 17, and may be 16 if they are learning on a moped or in a vehicle their licence allows.
          Nobody younger than that may hold an account. Where a learner is under 18, a Business may record a parent or
          guardian to contact, and the learner is shown as under 18 to the instructor teaching them.
        </LegalText>
        <ForTheSolicitor>
          <p>Please confirm the minimum age, and what consent is needed from a parent or guardian.</p>
        </ForTheSolicitor>
      </LegalSection>
    </LegalPage>
  );
}
