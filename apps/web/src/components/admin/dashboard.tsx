import { countOf, formatCount } from '@repo/core/counts';
import { formatPence } from '@repo/core/money';
import { Card, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Skeleton } from '@repo/ui/skeleton';
import { BadgeCheck, Gavel } from 'lucide-react';
import Link from 'next/link';
import { Figure } from '@/components/figure';
import type { PlatformDashboard } from '@/lib/admin/dashboard';

function badgesWords(waiting: number, oldestSince: string | null): string {
  if (waiting === 0) return 'Every badge sent in has been checked';
  // A badge can wait without the time it was sent, as the seeded trainee's does.
  if (oldestSince === null) return waiting === 1 ? 'Open the queue to check it' : 'Open the queue to check them';
  return waiting === 1 ? `Sent ${oldestSince}` : `The oldest was sent ${oldestSince}`;
}

function disputesWords(open: number, oldestSince: string | null): string {
  if (open === 0) return 'No learner is disputing a no-show';
  if (oldestSince === null) return open === 1 ? 'For its Business to decide' : 'Each for its Business to decide';
  return open === 1
    ? `Raised ${oldestSince}, for its Business to decide`
    : `The oldest raised ${oldestSince}, each for its Business to decide`;
}

/** ADM-01, ADM-03: what is waiting on platform staff, oldest first. */
export function WaitingOnStaff({
  dashboard,
  idPrefix = 'waiting',
}: {
  dashboard: Pick<PlatformDashboard, 'verification' | 'disputes'>;
  /** Keeps the heading's id unique where the card appears more than once, as on the design page. */
  idPrefix?: string;
}) {
  const { verification, disputes } = dashboard;
  return (
    <Card padding="none" role="region" aria-labelledby={`${idPrefix}-title`}>
      <div className="px-4 pt-4 pb-2">
        <CardTitle id={`${idPrefix}-title`}>Waiting on a person</CardTitle>
      </div>
      <ul className="pb-2">
        <li>
          <ListRow
            asChild
            chevron
            leading={<BadgeCheck className="text-grey-700" size={24} strokeWidth={1.5} aria-hidden />}
            title={verification.waiting === 0 ? 'No badges to check' : countOf(verification.waiting, 'badge to check', 'badges to check')}
            subtitle={badgesWords(verification.waiting, verification.oldestSince)}
          >
            <Link href="/admin/verification" />
          </ListRow>
        </li>
        <li>
          <ListDivider />
          <ListRow
            leading={<Gavel className="text-grey-700" size={24} strokeWidth={1.5} aria-hidden />}
            title={disputes.open === 0 ? 'No disputes open' : countOf(disputes.open, 'dispute open', 'disputes open')}
            subtitle={disputesWords(disputes.open, disputes.oldestSince)}
          />
        </li>
      </ul>
    </Card>
  );
}

/** ADM-01: the platform over the last 30 days. */
export function DashboardFigures({
  dashboard,
  idPrefix = 'platform-month',
}: {
  dashboard: PlatformDashboard;
  /** Keeps the heading's id unique where the figures appear more than once, as on the design page. */
  idPrefix?: string;
}) {
  const { range, signups, businesses, lessons, money } = dashboard;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${idPrefix}-title`}>
      <div className="flex flex-col gap-0.5">
        <h2 id={`${idPrefix}-title`} className="text-h3 text-black">
          The last 30 days
        </h2>
        <p className="text-small text-grey-700">{range}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="The platform at a glance">
        <Figure
          label="Sign-ups"
          value={formatCount(signups.total)}
          detail={`${countOf(signups.learners, 'learner', 'learners')}, ${countOf(signups.instructors, 'instructor', 'instructors')}, ${countOf(
            signups.schools,
            'school',
            'schools',
          )}, ${formatCount(signups.undecided)} yet to choose`}
        />
        <Figure
          label="Active Businesses"
          value={formatCount(businesses.active)}
          detail={`${countOf(businesses.independent, 'independent instructor', 'independent instructors')} and ${countOf(
            businesses.schools,
            'school',
            'schools',
          )}`}
        />
        <Figure label="Teaching" value={formatCount(businesses.teaching)} detail="Active Businesses with lessons in these days" />
        <Figure label="Suspended" value={formatCount(businesses.suspended)} detail="Businesses suspended by platform staff" />
        <Figure label="Lessons booked" value={formatCount(lessons.booked)} detail="Booked in these days and not declined" />
        <Figure label="Lessons completed" value={formatCount(lessons.completed)} detail="Taught in these days" />
        <Figure
          label="GMV"
          value={formatPence(money.gmvPence)}
          detail={`${countOf(money.payments, 'payment', 'payments')}, ${formatPence(money.cardPence)} by card, ${formatPence(
            money.refundsPence,
          )} refunded`}
        />
        <Figure label="Fees earned" value={formatPence(money.feesPence)} detail="Platform fees on those payments" />
      </dl>
    </section>
  );
}

/** While the figures load: the same shapes, so nothing jumps when they arrive. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-40 rounded-card" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
