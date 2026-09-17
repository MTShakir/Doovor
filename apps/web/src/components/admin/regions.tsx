'use client';

import { countOf, formatCount } from '@repo/core/counts';
import type { SwitchOnRule } from '@repo/core/regions';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Dialog } from '@repo/ui/dialog';
import { EmptyState } from '@repo/ui/empty-state';
import { StatusPill } from '@repo/ui/status-pill';
import { MapPinned } from 'lucide-react';
import { useState } from 'react';
import type { AdminRegion } from '@/lib/admin/regions';

/** ADM-04, PRD 4.2: the rule an area has to meet, in words. */
export function SwitchOnRuleCard({ rule }: { rule: SwitchOnRule }) {
  return (
    <Card className="flex flex-col gap-1">
      <CardTitle>The switch-on rule</CardTitle>
      <CardDescription>
        The learner marketplace opens in a postcode area once it has at least {countOf(rule.instructors, 'verified instructor', 'verified instructors')}{' '}
        covering it, with at least {countOf(rule.hours, 'free hour', 'free hours')} between them in the next 14 days. Opening an area
        emails everybody waiting there, once.
      </CardDescription>
    </Card>
  );
}

function Standing({ region }: { region: AdminRegion }) {
  if (region.open) return <StatusPill status="confirmed">Open</StatusPill>;
  if (region.meetsRule) return <StatusPill status="attention">Ready to open</StatusPill>;
  return <StatusPill status="pending">Closed</StatusPill>;
}

function Against({ value, target, short, unit }: { value: number; target: number; short: number; unit: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-body text-ink tabular-nums">
        {formatCount(value)} <span className="text-grey-700">of {formatCount(target)}</span>
      </span>
      <span className="text-small text-grey-700 tabular-nums">{short === 0 ? 'Enough' : `${formatCount(short)} ${unit} short`}</span>
    </div>
  );
}

/** ADM-04: every area where anything is happening, against the rule, with Open or Close for a super admin. */
export function RegionsTable({
  regions,
  rule,
  canSwitch,
  onOpen,
  onClose,
}: {
  regions: AdminRegion[];
  rule: SwitchOnRule;
  canSwitch: boolean;
  onOpen: (region: AdminRegion) => void;
  onClose: (region: AdminRegion) => void;
}) {
  if (regions.length === 0) {
    return (
      <EmptyState
        icon={MapPinned}
        title="No areas yet"
        description="An area shows here once an instructor covers it or a learner joins its waiting list."
      />
    );
  }
  return (
    // Relative, so the words kept for screen readers scroll with the table instead of widening the page.
    <Card padding="none" className="relative overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left">
        <caption className="sr-only">Postcode areas against the switch-on rule</caption>
        <thead>
          <tr className="border-b border-grey-200 text-small text-grey-700">
            <th scope="col" className="px-4 py-3 font-semibold">Area</th>
            <th scope="col" className="px-4 py-3 font-semibold">Instructors</th>
            <th scope="col" className="px-4 py-3 font-semibold">Free hours, 14 days</th>
            <th scope="col" className="px-4 py-3 font-semibold">Waiting</th>
            <th scope="col" className="px-4 py-3 font-semibold">Requests</th>
            <th scope="col" className="px-4 py-3 font-semibold">Marketplace</th>
            {canSwitch ? (
              <th scope="col" className="px-4 py-3 font-semibold">
                <span className="sr-only">Change</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {regions.map((region) => (
            <tr key={region.area} className="border-b border-grey-200 last:border-b-0">
              <th scope="row" className="px-4 py-3 text-body font-medium text-ink">
                {region.label}
              </th>
              <td className="px-4 py-3">
                <Against value={region.instructors} target={rule.instructors} short={region.instructorsShort} unit={region.instructorsShort === 1 ? 'instructor' : 'instructors'} />
              </td>
              <td className="px-4 py-3">
                <Against value={region.freeHours} target={rule.hours} short={region.hoursShort} unit={region.hoursShort === 1 ? 'hour' : 'hours'} />
              </td>
              <td className="px-4 py-3 text-body text-ink tabular-nums">{formatCount(region.waiting)}</td>
              <td className="px-4 py-3 text-body text-ink tabular-nums">{formatCount(region.requests)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  <Standing region={region} />
                  {region.switchedOn ? <span className="text-small text-grey-700">Since {region.switchedOn}</span> : null}
                </div>
              </td>
              {canSwitch ? (
                <td className="px-4 py-3 text-right">
                  {region.open ? (
                    <Button variant="secondary" size="md" onClick={() => { onClose(region); }}>
                      Close<span className="sr-only"> {region.label}</span>
                    </Button>
                  ) : region.meetsRule ? (
                    <Button size="md" onClick={() => { onOpen(region); }}>
                      Open<span className="sr-only"> {region.label}</span>
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** ADM-04: opening or closing an area asks first, and says who hears about it. */
export function SwitchRegionDialog({
  change,
  pending,
  onConfirm,
  onCancel,
}: {
  change: { region: AdminRegion; open: boolean } | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [shown, setShown] = useState(change);
  // Keep the words while the dialog closes, so it does not empty as it fades.
  if (change !== null && change !== shown) setShown(change);
  const label = shown?.region.label ?? '';
  const opening = shown?.open ?? true;
  const told = (shown?.region.waiting ?? 0) + (shown?.region.requests ?? 0) > 0;

  return (
    <Dialog
      open={change !== null}
      onOpenChange={(open) => { if (!open) onCancel(); }}
      title={opening ? `Open the marketplace in ${label}?` : `Close the marketplace in ${label}?`}
      description={
        opening
          ? `Learners there can find and book instructors. ${told ? 'Everybody on its waiting list or with a lesson request there is emailed once to say so.' : 'Nobody is waiting there to be told.'}`
          : 'Learners there go back to joining its waiting list. Nobody is emailed.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {opening ? 'Keep it closed' : 'Keep it open'}
          </Button>
          <Button pending={pending} onClick={onConfirm}>
            {opening ? 'Open' : 'Close'}
          </Button>
        </>
      }
    />
  );
}
