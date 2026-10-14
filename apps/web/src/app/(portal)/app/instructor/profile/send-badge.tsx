'use client';

import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { useState } from 'react';
import { BadgeForm } from '@/components/badge/badge-form';
import { resubmitBadge } from './actions';

interface SendBadgeProps {
  /** "Send your badge", "Send your badge again" or "Send your new badge". */
  label: string;
  /** Why the last one was refused, said again where they put it right. */
  reason: string | null;
  profileId: string;
  qualification: 'adi' | 'pdi';
  badgeNumber: string | null;
  badgeExpiry: string | null;
  badgePreview?: string;
  hasBadgePhoto: boolean;
}

/**
 * Sending a badge from the profile (INS-02, D-262): one skipped in onboarding, one that was refused,
 * or a new one after the old one ran out. The same form as onboarding, in a sheet, so the rules
 * and the words cannot drift between the two.
 */
export function SendBadge({ label, reason, ...badge }: SendBadgeProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        width="full"
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={label}
        description="A person checks it against the DVSA register. Nobody else can see the photo."
      >
        <div className="flex flex-col gap-5">
          {reason ? (
            <p className="rounded-input bg-grey-100 p-3 text-small text-ink">
              <span className="font-semibold">Why we could not verify it: </span>
              {reason}
            </p>
          ) : null}
          <BadgeForm
            {...badge}
            onSave={resubmitBadge}
            onSaved={() => {
              setOpen(false);
              toast('Sent for checking');
            }}
            submitLabel="Send for checking"
          />
        </div>
      </Sheet>
    </>
  );
}
