import { cn } from '../lib/cn';

export interface BarSlice {
  /** Which part of the bar this is, matching a key in the legend. */
  key: string;
  value: number;
}

export interface Bar {
  /** Under the bar, short enough to fit: "Mon". */
  label: string;
  /** Read out instead of the bar: "Mon 14 Sep: £42, all cash". */
  description: string;
  slices: BarSlice[];
}

export interface BarChartLegend {
  key: string;
  label: string;
  /** A Tailwind background class from the theme, such as "bg-black". */
  fill: string;
}

/**
 * Bars over days, each one stacked from its parts (MNY-01, D-177). The picture is for the eye and
 * the words are for everybody: each bar carries what it holds as text, so a screen reader reads
 * the figures rather than guessing at heights.
 */
export function BarChart({
  bars,
  legend,
  label,
  className,
}: {
  bars: Bar[];
  legend: BarChartLegend[];
  /** What the whole chart is: "Earnings each day this week". */
  label: string;
  className?: string;
}) {
  const totals = bars.map((bar) => bar.slices.reduce((sum, slice) => sum + slice.value, 0));
  // The tallest bar fills the chart; with nothing at all, every bar is empty rather than full.
  const tallest = Math.max(...totals, 0);
  const fillFor = (key: string): string => legend.find((one) => one.key === key)?.fill ?? 'bg-grey-200';

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ol className="flex h-40 items-end gap-1" aria-label={label}>
        {bars.map((bar, index) => {
          const total = totals[index] ?? 0;
          return (
            <li key={bar.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="flex w-full flex-1 flex-col justify-end" aria-label={bar.description} role="img">
                {total === 0 ? (
                  <span className="h-0.5 w-full rounded-full bg-grey-200" />
                ) : (
                  <span className="flex w-full flex-col-reverse" style={{ height: `${String(Math.max((total / tallest) * 100, 2))}%` }}>
                    {bar.slices
                      .filter((slice) => slice.value > 0)
                      .map((slice) => (
                        <span
                          key={slice.key}
                          className={cn('w-full first:rounded-t-input', fillFor(slice.key))}
                          style={{ height: `${String((slice.value / total) * 100)}%` }}
                        />
                      ))}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-caption text-grey-700" aria-hidden>
                {bar.label}
              </span>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="What the colours mean">
        {legend.map((one) => (
          <li key={one.key} className="flex items-center gap-1.5 text-small text-grey-700">
            <span className={cn('size-3 rounded-full', one.fill)} aria-hidden />
            {one.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
