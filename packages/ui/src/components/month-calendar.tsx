'use client';

import { addDaysToLocalDate, formatLocalDate, isoWeekday, parseLocalDate, type LocalDate } from '@repo/core/time';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn';

export interface MonthCalendarProps {
  /** First day of the month shown, "YYYY-MM-01". */
  month: LocalDate;
  onMonthChange: (month: LocalDate) => void;
  selected: LocalDate | null;
  onSelect: (date: LocalDate) => void;
  today: LocalDate;
  isDisabled?: (date: LocalDate) => boolean;
  /** Dates with lessons get a dot. */
  marked?: ReadonlySet<LocalDate>;
  className?: string;
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabelFormatter = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function shiftMonth(month: LocalDate, delta: number): LocalDate {
  const { year, month: m } = parseLocalDate(month);
  const shifted = new Date(Date.UTC(year, m - 1 + delta, 1));
  return formatLocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
}

/** Month grid, weeks starting Monday (UK). Used for date picking and the diary month view. */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  today,
  isDisabled,
  marked,
  className,
}: MonthCalendarProps) {
  const { year, month: m } = parseLocalDate(month);
  const first = formatLocalDate(year, m, 1);
  const leading = isoWeekday(first) - 1;
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells: (LocalDate | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => addDaysToLocalDate(first, index)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const navButton =
    'flex size-12 items-center justify-center rounded-full hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-black';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <button type="button" className={navButton} onClick={() => { onMonthChange(shiftMonth(month, -1)); }} aria-label="Previous month">
          <ChevronLeft size={24} strokeWidth={1.5} aria-hidden />
        </button>
        <h2 className="text-h3 text-black" aria-live="polite">
          {monthFormatter.format(new Date(Date.UTC(year, m - 1, 1)))}
        </h2>
        <button type="button" className={navButton} onClick={() => { onMonthChange(shiftMonth(month, 1)); }} aria-label="Next month">
          <ChevronRight size={24} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {weekdayLabels.map((label) => (
              <th key={label} scope="col" className="pb-2 text-caption font-medium text-grey-700">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <tr key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((date, col) => {
                if (!date) return <td key={`empty-${String(col)}`} />;
                const { day } = parseLocalDate(date);
                const isSelected = date === selected;
                const isToday = date === today;
                const disabled = isDisabled?.(date) ?? false;
                return (
                  <td key={date} className="p-0.5 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      aria-pressed={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      aria-label={dayLabelFormatter.format(new Date(Date.UTC(year, m - 1, day)))}
                      onClick={() => {
                        onSelect(date);
                      }}
                      className={cn(
                        // Fills the column up to the 48 px touch target (PRD 7.1).
                        'relative mx-auto flex aspect-square w-full max-w-12 flex-col items-center justify-center rounded-full text-body tabular-nums transition-colors duration-200',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
                        isSelected ? 'bg-black font-semibold text-white' : 'text-ink hover:bg-grey-100',
                        isToday && !isSelected && 'font-semibold ring-1 ring-black',
                        'disabled:text-grey-400 disabled:hover:bg-transparent',
                      )}
                    >
                      {day}
                      {marked?.has(date) ? (
                        <span
                          className={cn('absolute bottom-1.5 size-1 rounded-full', isSelected ? 'bg-white' : 'bg-black')}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
