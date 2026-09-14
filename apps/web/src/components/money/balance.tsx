import { historyLine, type OwedLesson } from '@repo/core/balance';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import type { ReactNode } from 'react';
import type { Balance, BalanceHistoryEntry, LessonInstructor } from '@/lib/payments/balance';

/**
 * A learner's balance with a Business, as both of the people it matters to see it (PAY-06, M3-16).
 *
 * The learner's Payments screen and the instructor's learner card render these same pieces from
 * the same `Balance`, so one cannot say a number the other does not. Nothing here says "you":
 * the same words are read on both sides.
 */

/** Credit, then what is owed, with the part that is overdue in red. */
export function BalanceLines({ balance }: { balance: Balance }) {
  return (
    <ul className="flex flex-col gap-1" aria-label="Balance">
      <li className="text-body text-ink tabular-nums">
        {balance.creditMinutes > 0 ? `${formatMinutes(balance.creditMinutes)} of credit` : 'No credit'}
      </li>
      {balance.owedPence > 0 ? (
        <li className="flex flex-wrap items-center gap-2 text-body text-ink tabular-nums">
          <span>{formatPence(balance.owedPence)} owed</span>
          {balance.overduePence > 0 ? (
            <StatusPill status="overdue">{`${formatPence(balance.overduePence)} overdue`}</StatusPill>
          ) : null}
        </li>
      ) : (
        <li className="text-body text-ink">Nothing owed</li>
      )}
    </ul>
  );
}

/**
 * The lessons owed for, the longest owed first. What can be done about one depends on who is
 * looking, so each screen brings its own action.
 */
export function OwedLessons({
  balance,
  action,
}: {
  balance: Balance;
  action?: (owed: OwedLesson, instructor: LessonInstructor | null) => ReactNode;
}) {
  if (balance.owed.length === 0) return null;

  return (
    <ul className="flex flex-col border-t border-grey-200" aria-label="Lessons owed for">
      {balance.owed.map((owed) => {
        const instructor = balance.instructors.get(owed.lesson.id) ?? null;
        const control = action?.(owed, instructor);
        return (
          <li key={owed.lesson.id} className="flex flex-col gap-2 border-b border-grey-200 px-4 py-3 last:border-b-0">
            <div className="flex items-start gap-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-body font-medium text-ink">
                  {formatDate(owed.lesson.startsAt)} at {formatTime(owed.lesson.startsAt)}
                </span>
                <span className="text-small text-grey-700">{instructor === null ? 'Lesson' : `With ${instructor.name}`}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill status={owed.overdue ? 'overdue' : 'unpaid'} />
                <span className="text-small text-grey-700 tabular-nums">{formatPence(owed.lesson.pricePence)}</span>
              </span>
            </div>
            {control ? <div className="flex flex-wrap justify-end gap-2">{control}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** What has happened to the learner's money with the Business, newest first. */
export function BalanceHistory({ history, limit }: { history: BalanceHistoryEntry[]; limit: number }) {
  const shown = history.slice(0, limit);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col border-t border-grey-200">
      <p className="px-4 pt-3 text-small font-semibold text-grey-700">Recent</p>
      <ul className="flex flex-col" aria-label="Recent payments and credit">
        {shown.map((entry) => {
          const line = historyLine(entry);
          return (
            <li key={entry.id} className="flex items-start gap-3 px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-ink">{line.title}</span>
                <span className="text-small text-grey-700">
                  {formatDate(entry.at)} · {line.detail}
                </span>
              </span>
              {line.amount === null ? null : <span className="shrink-0 text-body text-ink tabular-nums">{line.amount}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
