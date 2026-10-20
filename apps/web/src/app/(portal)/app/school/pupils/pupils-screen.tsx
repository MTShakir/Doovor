'use client';

import { Button } from '@repo/ui/button';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EnquiryInbox } from '@/components/school/enquiry-inbox';
import { GivePupilSheet } from '@/components/school/give-pupil-sheet';
import { OfferPupilSheet, type LinkedChoice } from '@/components/school/offer-pupil-sheet';
import type { Enquiry, EnquiryStatus } from '@/lib/school/enquiries';
import { addEnquiry, allocationForEnquiry, closeEnquiry, giveEnquiry, offerEnquiry, reopenEnquiry } from './actions';

/**
 * The inbox, with the school's own actions behind it (M9-16 to M9-18, D-288, D-289): a pupil is
 * offered to instructors linked to the school, or given to one of its own.
 */
export function PupilsScreen({
  status,
  counts,
  enquiries,
  consentWords,
  linked,
  hasTeachers,
}: {
  status: EnquiryStatus;
  counts: Record<EnquiryStatus, number>;
  enquiries: Enquiry[];
  consentWords: string;
  linked: LinkedChoice[];
  /** The school has instructors of its own to give a pupil to. */
  hasTeachers: boolean;
}) {
  const router = useRouter();
  const [offering, setOffering] = useState<Enquiry | null>(null);
  const [giving, setGiving] = useState<Enquiry | null>(null);
  const refresh = () => { router.refresh(); };

  return (
    <>
      <EnquiryInbox
        status={status}
        counts={counts}
        enquiries={enquiries}
        consentWords={consentWords}
        handlers={{ add: addEnquiry, close: closeEnquiry, reopen: reopenEnquiry, refresh }}
        actions={(enquiry) => (
          <>
            {linked.length > 0 ? (
              <Button variant="secondary" onClick={() => { setOffering(enquiry); }}>
                {enquiry.status === 'offered' ? 'Offer to more' : 'Offer to instructors'}
              </Button>
            ) : null}
            {hasTeachers ? (
              <Button variant="secondary" onClick={() => { setGiving(enquiry); }}>
                Give to an instructor
              </Button>
            ) : null}
          </>
        )}
      />
      <OfferPupilSheet
        pupil={offering}
        linked={linked}
        onOffer={offerEnquiry}
        onClose={() => { setOffering(null); }}
        onOffered={() => {
          setOffering(null);
          toast('Offered');
          refresh();
        }}
      />
      <GivePupilSheet
        pupil={giving}
        loadAllocation={allocationForEnquiry}
        onGive={giveEnquiry}
        onClose={() => { setGiving(null); }}
        onGiven={(name) => {
          setGiving(null);
          toast(`Given to ${name}`);
          refresh();
        }}
      />
    </>
  );
}
