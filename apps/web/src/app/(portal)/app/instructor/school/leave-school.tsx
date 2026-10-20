'use client';

import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Dialog } from '@repo/ui/dialog';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { leaveSchool } from './actions';

/** Leaving the school a business is linked to, after saying what that changes (D-282). */
export function LeaveSchool({ linkId, school, proGiven }: { linkId: string; school: string; proGiven: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="secondary" width="responsive" onClick={() => { setOpen(true); }}>
        Leave {school}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Leave ${school}?`}
        description={`Your business, its learners, prices and payments stay yours. ${school} stops sending you pupils, ${brand.name} checks your badge again before your profile is back on the site${proGiven ? ', and the Pro it paid for ends' : ''}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setOpen(false); }}>
              Stay
            </Button>
            <Button
              pending={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await leaveSchool(linkId);
                  if (!result.ok) {
                    toast(result.message);
                    return;
                  }
                  setOpen(false);
                  toast(`You have left ${school}`);
                  router.refresh();
                });
              }}
            >
              Leave {school}
            </Button>
          </>
        }
      />
    </>
  );
}
