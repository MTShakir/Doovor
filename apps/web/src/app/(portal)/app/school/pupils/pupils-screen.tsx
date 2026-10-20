'use client';

import { useRouter } from 'next/navigation';
import { EnquiryInbox } from '@/components/school/enquiry-inbox';
import type { Enquiry, EnquiryStatus } from '@/lib/school/enquiries';
import { addEnquiry, closeEnquiry, reopenEnquiry } from './actions';

/** The inbox, with the school's own actions behind it (M9-16, D-288). */
export function PupilsScreen({
  status,
  counts,
  enquiries,
  consentWords,
}: {
  status: EnquiryStatus;
  counts: Record<EnquiryStatus, number>;
  enquiries: Enquiry[];
  consentWords: string;
}) {
  const router = useRouter();
  return (
    <EnquiryInbox
      status={status}
      counts={counts}
      enquiries={enquiries}
      consentWords={consentWords}
      handlers={{
        add: addEnquiry,
        close: closeEnquiry,
        reopen: reopenEnquiry,
        refresh: () => { router.refresh(); },
      }}
    />
  );
}
