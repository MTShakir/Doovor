import { statsRange, statsRangeKeys, type StatsRange } from '@repo/core/stats-range';
import type { LocalDate } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * The days the dashboard adds up over (ADM-01, D-171): a button each for today, this week, this
 * month, the last 30 days and this tax year, and two dates for anything else. Buttons are links
 * and the dates are a plain form, so the screen works before it comes alive and each range has an
 * address staff can keep.
 */
export function DateRangePicker({ today, chosen, base }: { today: LocalDate; chosen: StatsRange; base: Route }) {
  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="dates-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="dates-title">Dates</CardTitle>
        <CardDescription>{chosen.range}</CardDescription>
      </div>
      <nav aria-label="Dates" className="flex flex-wrap gap-2">
        {statsRangeKeys.map((key) => (
          <Link
            key={key}
            // The last 30 days is what the screen shows without being asked, so it is the plain address.
            href={key === 'last_30_days' ? base : (`${base}?range=${key}` as Route)}
            aria-current={key === chosen.key ? 'page' : undefined}
            className={`flex h-12 items-center justify-center rounded-full px-4 text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black md:text-body ${
              key === chosen.key ? 'bg-black text-white' : 'bg-grey-100 text-black hover:bg-grey-200'
            }`}
          >
            {statsRange(key, today).label}
          </Link>
        ))}
      </nav>
      <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        <Field label="From" className="min-w-40 flex-1">
          <Input type="date" name="from" defaultValue={chosen.from} />
        </Field>
        <Field label="To" className="min-w-40 flex-1">
          <Input type="date" name="to" defaultValue={chosen.to} />
        </Field>
        <Button type="submit" variant="secondary" className="h-12">
          Show these days
        </Button>
      </form>
    </Card>
  );
}
