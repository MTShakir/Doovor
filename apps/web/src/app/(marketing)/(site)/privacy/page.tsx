import { brand, companyDisclosure } from '@repo/config/brand';
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
      updated="19 September 2026"
    >
      <LegalSection title="Who is responsible">
        <LegalText>
          {brand.name} is run by {companyDisclosure()} It is registered with the Information Commissioner&apos;s Office
          under reference {brand.icoRegistration}, and questions about your data go to {brand.supportEmail}. Two
          different things happen on {brand.name}, and who is responsible differs between them.
        </LegalText>
        <LegalList
          items={[
            'When a driving instructor or a school uses the app to run their own business, they decide what they keep about their learners. They are the controller of that, and we hold it for them as their processor.',
            'When somebody searches for lessons, looks at a public profile or creates an account, we decide what we keep. We are the controller of that.',
          ]}
        />
        <ForTheSolicitor>
          <p>
            Please confirm the controller and processor split above, and say whether a representative or data
            protection officer must be named.
          </p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="What we hold">
        <LegalTable
          caption="Everything the product stores today."
          rows={[
            ['Your account', 'Name, email address, mobile number, password (stored only as a hash), the dates you signed in, and an account number of our own so we can find you without using your name.'],
            ['Instructors and schools', 'Business name, the area you cover, your working hours, your prices, your car, the languages you teach in, and your ADI or PDI badge number and its expiry date.'],
            [
              'An instructor’s books',
              'If you keep your books with us: what you spent and what it was for, a photograph of the receipt where you add one, the cars you teach in and how each one is claimed, the miles you drove for work, and whether you are registered for VAT along with your VAT number. These are your business records rather than anything about a learner. Only you can see them, and nobody at a school you teach for can. Working them into a tax figure is ours to get right and your accountant’s to check, and we never file anything on your behalf.',
            ],
            ['Learners', 'Who teaches you, your lessons, what you have paid, your progress against the DVSA syllabus, and your date of birth where a Business asks for it so it knows whether you are under 18. You are also asked which gearbox you want to learn in and whether you have passed the theory test, so your instructor can plan around both. Answering is your choice and you can change either whenever you like.'],
            [
              'Your health, if you tell us',
              'You can tell us about a disability, health condition or learning difficulty, and about medication that could affect your driving, so your instructor can plan lessons that suit you and knows what to watch for. We ask about medication only where it could affect your driving, and nothing else about your health. This is health information, which the law treats as special, and we hold it only because you chose to tell us. Answering is your choice: you can skip either question, change your answer, or take it off your record at any time from About you in your account. We keep it apart from the rest of your details, in a table only you can write to, and only the instructor who teaches you and the people who run the school you learn with can read it. It is never used to decide whether you can learn with us, and it is never sold or shared.',
            ],
            [
              'Where your lessons start',
              'The addresses you are collected from, with their postcode, and a point on the map for each one. The point comes from the middle of the postcode unless you drag the pin to the door yourself. You can add, change and remove these whenever you like, and pick which one a lesson uses. Your instructor and the school you learn with see them, because that is how they know where to be. A place your school added stays theirs, and one you added stays yours.',
            ],
            ['Lessons and money', 'Bookings, cancellations, payments, refunds, receipts and credit. Card numbers are never sent to us: the card fields belong to Stripe and the card goes straight to them.'],
            ['Pictures', 'A profile photograph if you add one, and a picture of a badge or a licence while it is being checked.'],
            ['Notes', 'An instructor can write private notes about a learner. Those are theirs, and no learner sees them.'],
            ['What the app did', 'An audit trail of the things that matter: who signed in, who changed a role, who saw a learner, who took a payment, and where a lesson was changed.'],
            ['Asking us to close your account', 'If you ask us to close your account we record that you asked, when, and the reason you gave, so we can deal with it and so you can change your mind before it happens.'],
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
            'Anything you tell us about your health is held only because you chose to tell us, and for no other reason. Take it back and we stop holding it.',
          ]}
        />
        <ForTheSolicitor>
          <p>Please confirm the lawful basis for each row, and the wording for the legitimate interests assessment.</p>
        </ForTheSolicitor>
      </LegalSection>

      <LegalSection title="Where it is kept">
        <LegalText>
          The database, the files and the accounts are held in London, and the app itself runs in London. We keep
          encrypted backups of the database ourselves, in the United Kingdom. Errors and usage go to services in the
          European Union. Some of the companies below work outside the United Kingdom:
          Stripe, Resend, Mapbox and Inngest may process what they handle outside the United Kingdom. If you sign in
          with Google, Google handles that sign in. Text messages are sent through Twilio's Ireland region, so the
          number a code goes to stays in the European Union.
        </LegalText>
        <LegalTable
          caption="The companies that hold something on our behalf."
          rows={[
            ['Supabase', 'The database, sign in, and the files people upload. London.'],
            ['Vercel', 'Runs the app itself. London.'],
            ['Stripe', 'Card payments and payouts. Stripe holds the card details; we never see them.'],
            ['Resend', 'Sends email.'],
            ['Twilio', 'Sends text messages, including sign in codes. Ireland.'],
            ['Mapbox', 'Draws the maps of the area an instructor covers.'],
            ['PostHog', 'Counts how the product is used, once you have agreed. European Union.'],
            ['Sentry', 'Records errors so we can fix them. Reports reach it through our own server, so it never sees your address. European Union.'],
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
            'An instructor’s own books, and the receipts photographed into them: six years for the same reason, and they go with the Business if it is closed.',
            'The audit trail: two years.',
            'Backups of the database: five weeks, encrypted, then deleted, so a deleted account has left every backup five weeks later.',
            'Pictures of a badge or a licence: removed once the check is done.',
            'What you told us about your health: for as long as you choose to leave it there. It is yours to take off your record at any moment, and it goes when your account does.',
            'Where your lessons start: while your account is open, and they are yours to remove sooner.',
            'A request to close your account: until the account is closed or you change your mind.',
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
