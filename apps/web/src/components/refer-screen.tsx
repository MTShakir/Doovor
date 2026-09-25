'use client';

import { brand } from '@repo/config/brand';
import { referralRewardMonths, referralShareMessage } from '@repo/core/referral';
import { whatsAppShareUrl } from '@repo/core/share';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Copy, MessageCircle, UserRoundPlus } from 'lucide-react';
import { useId } from 'react';
import type { Referrals } from '@/lib/billing/referrals';

function copy(text: string, done: string) {
  void navigator.clipboard.writeText(text).then(
    () => { toast(done); },
    () => { toast('Copy it from the box above'); },
  );
}

/** "a month" reads better than "1 month", and the number is a setting, so both are handled. */
function months(count: number): string {
  if (count === 1) return 'a month';
  return `${String(count)} months`;
}

/**
 * Telling another instructor about it (D-205): the link, who has come from it, and what that has
 * earned. Nothing here charges or credits anybody, because nothing charges anybody yet (D-022);
 * what is earned is counted and says plainly that it lands when billing starts.
 */
export function ReferScreen({ referrals }: { referrals: Referrals }) {
  const titleId = useId();
  const message = referralShareMessage(brand.name, referrals.link);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4" role="region" aria-labelledby={titleId}>
        <div className="flex flex-col gap-1">
          <CardTitle id={titleId}>Your link</CardTitle>
          <CardDescription>
            Every instructor who starts a business from your link earns you {months(referralRewardMonths)} of the paid plan.
          </CardDescription>
        </div>

        <Field label="Link" hint={`Your code is ${referrals.code}.`}>
          <Input readOnly value={referrals.link} onFocus={(event) => { event.target.select(); }} />
        </Field>

        <div className="flex flex-wrap gap-2 [&>*]:min-w-0">
          <Button variant="secondary" onClick={() => { copy(referrals.link, 'Link copied'); }}>
            <Copy className="size-5" aria-hidden />
            Copy link
          </Button>
          <Button variant="secondary" asChild>
            <a href={whatsAppShareUrl(message)} target="_blank" rel="noreferrer">
              <MessageCircle className="size-5" aria-hidden />
              Share on WhatsApp
            </a>
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4" role="region" aria-labelledby="joined-title">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle id="joined-title">Who has joined</CardTitle>
          {referrals.monthsEarned === 0 ? null : (
            <StatusPill status="credit">{months(referrals.monthsEarned)} earned</StatusPill>
          )}
        </div>

        {referrals.joined.length === 0 ? (
          <EmptyState
            icon={UserRoundPlus}
            title="Nobody yet"
            description="Send your link to an instructor you know. When they start their business from it, it shows here."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {referrals.joined.map((one) => (
                <li key={one.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-grey-200 pb-2 last:border-0 last:pb-0">
                  <div className="flex flex-col">
                    <span className="text-body font-semibold text-ink">{one.name}</span>
                    <span className="text-small text-grey-700">
                      {one.kind}, joined {one.joined}
                    </span>
                  </div>
                  <StatusPill status={one.applied ? 'completed' : 'pending'}>
                    {one.applied ? `${months(one.months)} applied` : `${months(one.months)} waiting`}
                  </StatusPill>
                </li>
              ))}
            </ul>
            <p className="text-small text-grey-700">
              Nothing is charged during the beta, so there is nothing to take the months off yet. They are held against your
              account and come off your first bill.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
