import { statsRange, statsRangeKeys, type StatsRange } from '@repo/core/stats-range';
import type { LocalDate } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import type { Route } from 'next';
import Link from 'next/link';

/** An address of the screen for some days, keeping whatever else it was asked for. */
function rangeHref(base: Route, range: Record<string, string>, keep: Record<string, string>): Route {
  const query = new URLSearchParams({ ...keep, ...range }).toString();
  return query === '' ? base : `${base}?${query}`;
}

/**
 * The days the dashboard adds up over (ADM-01, D-171): a button each for today, this week, this
 * month, the last 30 days and this tax year, and two dates for anything else. Buttons are links
 * and the dates are a plain form, so the screen works before it comes alive and each range has an
 * address staff can keep. A screen with filters of its own keeps them as the days change (D-413).
 */
export function DateRangePicker({
  today,
  chosen,
  base,
  keep = {},
}: {
  today: LocalDate;
  chosen: StatsRange;
  base: Route;
  keep?: Record<string, string>;
}) {
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
            href={rangeHref(base, key === 'last_30_days' ? {} : { range: key }, keep)}
            aria-current={key === chosen.key ? 'page' : undefined}
            className={`flex h-12 items-center justify-center rounded-full px-4 text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black md:text-body ${
              key === chosen.key ? 'bg-black text-white' : 'bg-quiet text-black hover:bg-quiet-strong'
            }`}
          >
            {statsRange(key, today).label}
          </Link>
        ))}
      </nav>
      <form method="get" action={base} className="flex flex-wrap items-end gap-3">
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
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
