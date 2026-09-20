import { plans as planDetails } from '@repo/config/plans';
import { countOf, formatCount } from '@repo/core/counts';
import { formatPence } from '@repo/core/money';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { ListDivider, ListRow } from '@repo/ui/list-row';
import { Skeleton } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import type { Route } from 'next';
import Link from 'next/link';
import { Figure } from '@/components/figure';
import type { PlatformIncome } from '@/lib/admin/income';

/** The share the platform kept, as a person would say it: "1.0% of what they moved". */
function share(pence: number, onPence: number): string {
  if (onPence === 0) return 'Nothing went through the platform in these days';
  return `${((pence / onPence) * 100).toFixed(1)}% of what those payments moved`;
}

/**
 * What the platform itself earned (ADM-01, ADM-10, D-174): the fees kept from card payments, who
 * paid them, and which plans Businesses are on. Lessons sold by a Business are the dashboard's
 * GMV; this screen is only money that came to the platform.
 */
export function PlatformIncomeScreen({ income, label }: { income: PlatformIncome; label: string }) {
  const { fees, byBusiness, plans } = income;
  const paying = plans.filter((row) => row.plan !== 'free').reduce((count, row) => count + row.businesses, 0);

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="income-title">
        <h2 id="income-title" className="text-h3 text-black">
          {label}
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="What the platform earned">
          <Figure label="Fees kept" value={formatPence(fees.pence)} detail={share(fees.pence, fees.onPence)} />
          <Figure label="Payments with a fee" value={formatCount(fees.payments)} detail="Card payments the platform took a fee on" />
          <Figure label="Plan payments" value={formatPence(0)} detail="Plans are not charged for yet" />
        </dl>
      </section>

      <Card padding="none" role="region" aria-labelledby="payers-title">
        <div className="flex flex-col gap-1 px-4 pt-4 pb-2">
          <CardTitle id="payers-title">Who paid the platform</CardTitle>
          <CardDescription>Most first, over the same days.</CardDescription>
        </div>
        {byBusiness.length === 0 ? (
          <p className="px-4 pb-4 text-small text-grey-700">No payment carried a platform fee in these days.</p>
        ) : (
          <ul className="pb-2">
            {byBusiness.map((row, index) => (
              <li key={row.id}>
                {index === 0 ? null : <ListDivider />}
                <ListRow
                  asChild
                  chevron
                  title={row.name}
                  subtitle={`${row.kind === 'school' ? 'School' : 'Instructor of one'}, ${countOf(row.payments, 'payment', 'payments')}`}
                  trailing={
                    <span className="flex items-center gap-2">
                      <StatusPill status={row.plan === 'free' ? 'pending' : 'paid'}>{planDetails[row.plan].label}</StatusPill>
                      <span className="text-body font-semibold text-black tabular-nums">{formatPence(row.pence)}</span>
                    </span>
                  }
                >
                  <Link href={`/admin/businesses?q=${encodeURIComponent(row.name)}` as Route} />
                </ListRow>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3" role="region" aria-labelledby="plans-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="plans-title">Plans</CardTitle>
          <CardDescription>
            {paying === 0 ? 'Nobody is on a paid plan yet.' : `${countOf(paying, 'Business is', 'Businesses are')} on a paid plan.`} Nothing
            is charged for a plan yet, so plan payments show above only once billing is switched on.
          </CardDescription>
        </div>
        <dl className="grid grid-cols-3 gap-3" aria-label="Businesses on each plan">
          {(['free', 'pro', 'school'] as const).map((key) => (
            <Figure
              key={key}
              label={planDetails[key].label}
              value={formatCount(plans.find((row) => row.plan === key)?.businesses ?? 0)}
              detail={
                planDetails[key].monthlyPricePence === 0
                  ? 'No monthly charge'
                  : `${formatPence(planDetails[key].monthlyPricePence)} a month when charged`
              }
            />
          ))}
        </dl>
      </Card>
    </>
  );
}

/** While the figures load: the same shapes, so nothing jumps when they arrive. */
export function IncomeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}
