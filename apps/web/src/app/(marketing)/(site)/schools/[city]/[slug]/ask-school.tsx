'use client';

import { enquiryConsentWords } from '@repo/core/schemas/school';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { EnquiryForm } from '@/components/school/enquiry-form';
import { askSchool } from './actions';

/** M9-15, D-288: the school's page asks who wants lessons, and says it has them once it does. */
export function AskSchool({ slug, school }: { slug: string; school: string }) {
  const [sent, setSent] = useState(false);
  return (
    <section aria-labelledby="ask-school-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="ask-school-heading" className="text-h3 text-black">
          Ask about lessons
        </h2>
        <p className="max-w-prose text-small text-grey-700">Leave your details and {school} will find you an instructor near you.</p>
      </div>
      {sent ? (
        <div role="status" className="flex items-start gap-3 rounded-card border border-grey-200 bg-white p-4">
          <CircleCheck className="size-6 shrink-0 text-black" aria-hidden />
          <p className="text-body text-ink">Thank you. {school} has your details and will be in touch soon.</p>
        </div>
      ) : (
        <div className="rounded-card border border-grey-200 bg-white p-4">
          <EnquiryForm
            mode="public"
            consentWords={enquiryConsentWords(school)}
            onSave={(values) => askSchool(slug, values)}
            onSaved={() => { setSent(true); }}
          />
        </div>
      )}
    </section>
  );
}
