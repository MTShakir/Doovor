'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { ChevronLeft, ChevronRight, Download, Users } from 'lucide-react';
import { useState } from 'react';
import type { MemberWeek, PayWeek } from '@/lib/school/pay';
import { MemberPayForm } from './member-pay-form';

export interface PayHandlers {
  savePay: Parameters<typeof MemberPayForm>[0]['onSave'];
  refresh: () => void;
}

/**
 * A week of lessons taught under a school, and each instructor's pay (M9-22, D-291): the school
 * sees everybody and can change what each is paid; an instructor sees their own. The week comes
 * as a CSV file too, for whatever pays them.
 */
export function PayWeekView({
  week,
  base,
  csvHref,
  handlers,
}: {
  week: PayWeek;
  /** The page's own address, for the week before and after. */
  base: string;
  csvHref: string;
  /** The school's, to change pay; none for an instructor reading their own. */
  handlers?: PayHandlers;
}) {
  const [changing, setChanging] = useState<MemberWeek | null>(null);
  const arrow =
    'flex size-12 shrink-0 items-center justify-center rounded-full bg-quiet text-black hover:bg-quiet-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black';

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Week" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <a href={`${base}?week=${week.previous}`} aria-label="The week before" className={arrow}>
            <ChevronLeft className="size-5" aria-hidden />
          </a>
          <a href={`${base}?week=${week.next}`} aria-label="The week after" className={arrow}>
            <ChevronRight className="size-5" aria-hidden />
          </a>
          <p className="ml-2 text-body font-semibold text-black">{week.label}</p>
        </div>
        <Button variant="secondary" asChild>
          <a href={csvHref} download>
            <Download className="size-5" aria-hidden />
            Download CSV
          </a>
        </Button>
      </nav>

      {week.members.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Nobody teaching here" description="Instructors teaching under your school show here with what they taught and their pay." />
        </Card>
      ) : (
        week.members.map((member) => (
          <Card key={member.membershipId} className="flex flex-col gap-3" role="region" aria-labelledby={`pay-${member.membershipId}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle id={`pay-${member.membershipId}`}>{member.name}</CardTitle>
                <CardDescription>
                  {member.payWords}
                  {member.active ? '' : ', no longer teaching here'}
                  {member.now.words === null ? '' : `. Now ${member.now.words}`}
                </CardDescription>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-body font-semibold tabular-nums text-black">
                  {member.payPence === null ? 'No pay set' : `${formatPence(member.payPence)} to pay`}
                </span>
                <span className="text-small text-grey-700">{member.taught}</span>
              </div>
            </div>
            {member.lessons.length === 0 ? null : (
              <ul className="flex flex-col divide-y divide-grey-200 rounded-card border border-grey-200 bg-white" aria-label={`${member.name}'s lessons`}>
                {member.lessons.map((lesson) => (
                  <li key={lesson.bookingId} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body font-semibold text-black">{lesson.when}</span>
                      <span className="text-small text-grey-700">
                        {lesson.learnerName}, {lesson.length}
                        {lesson.noShow ? ', no-show' : ''}
                      </span>
                    </span>
                    <span className="flex flex-col items-end text-small tabular-nums">
                      <span className="text-ink">{formatPence(lesson.pricePence)} lesson</span>
                      {lesson.payPence === null ? null : <span className="font-semibold text-black">{formatPence(lesson.payPence)} pay</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {handlers ? (
              <div>
                <Button variant="secondary" onClick={() => { setChanging(member); }}>
                  {member.now.basis === null ? 'Set pay' : 'Change pay'}
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}

      {handlers ? (
        <Sheet
          open={changing !== null}
          onOpenChange={(open) => { if (!open) setChanging(null); }}
          title={`Pay for ${changing?.name ?? 'this instructor'}`}
          description="From this week's statement on. Your school pays them; nothing is paid from here."
        >
          {changing === null ? null : (
            <MemberPayForm
              key={changing.membershipId}
              membershipId={changing.membershipId}
              basis={changing.now.basis}
              hourlyPence={changing.now.hourlyPence}
              sharePercent={changing.now.sharePercent}
              onSave={handlers.savePay}
              onSaved={() => {
                setChanging(null);
                toast('Pay saved');
                handlers.refresh();
              }}
            />
          )}
        </Sheet>
      ) : null}
    </div>
  );
}
