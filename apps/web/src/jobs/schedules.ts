/**
 * When each scheduled job runs (D-271), kept in one place so what they cost together is checked.
 *
 * The job runner's free plan allows 50,000 executions a month. One job running every minute is
 * 44,640 of them in a long month on its own, and two of them used the month up by the middle of
 * October 2026, when every job would have stopped. So a schedule is only as frequent as what it
 * does needs: what follows something somebody did runs from that event at once, notifications go
 * out in the same run that writes them, and these sweeps only catch what no event can. Sweeps that
 * only change the database run inside it instead, on its own scheduler (D-274): giving back lapsed
 * holds and lapsing unanswered requests, every five minutes, in `20261018100000_sweeps_in_the_database`.
 */
export const schedules = {
  /** Events still in the outbox go to the runner, and notifications that failed are tried again. */
  outbox: '*/3 * * * *',
  /** Reminders, and the nudge five minutes before a lesson starts (D-201), which needs this resolution. */
  reminders: '*/5 * * * *',
  /** Cards for requests that ran out are let go. An answer or an authorisation settles at once. */
  authorisations: 'TZ=Europe/London */15 * * * *',
  /** About a day before a lesson (PAY-03): half an hour either way is still about a day. */
  charges: 'TZ=Europe/London */30 * * * *',
  badgeExpiry: 'TZ=Europe/London 0 7 * * *',
  maintenance: 'TZ=Europe/London 30 3 * * *',
  recurrence: 'TZ=Europe/London 15 4 * * *',
  deletion: 'TZ=Europe/London 45 3 * * *',
  overdue: 'TZ=Europe/London 0 10 * * *',
  dailySummaries: 'TZ=Europe/London 0 8 * * *',
  renewals: 'TZ=Europe/London 0 8 * * *',
} as const;

/** What the free plan runs in a month (D-271). */
export const monthlyExecutions = 50_000;

/** How many times a day a schedule runs: every minute, every so many minutes, or at a set time. */
export function runsPerDay(schedule: string): number {
  const [minute = '', hour = ''] = schedule.replace(/^TZ=\S+\s+/, '').split(/\s+/);
  const each = (field: string, of: number): number =>
    field === '*' ? of : /^\*\/\d+$/.test(field) ? Math.ceil(of / Number(field.slice(2))) : 1;
  return each(minute, 60) * each(hour, 24);
}
