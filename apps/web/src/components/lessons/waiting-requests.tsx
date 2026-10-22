import { formatDate, formatTime, utcToLocal } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import { ChevronRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { WaitingRequest } from '@/lib/lessons/teaching';

/**
 * Lessons somebody asked for, on Today (BOK-06, R-12, D-379). Each opens its day in the diary,
 * where it is accepted or declined. Nothing is drawn while nobody is waiting.
 */
export function WaitingRequests({ requests }: { requests: WaitingRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="requests-title" className="flex flex-col gap-2">
      <h2 id="requests-title" className="text-h3 text-black">
        Waiting for your answer
      </h2>
      <ul className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white" aria-label="Lessons asked for">
        {requests.map((request) => {
          const startsAt = new Date(request.startsAt);
          const answerBy = request.answerBy === null ? null : new Date(request.answerBy);
          return (
            <li key={request.id}>
              <Link
                href={`/app/instructor/diary?view=day&date=${utcToLocal(startsAt).date}` as Route}
                className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              >
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="text-body font-semibold text-black">{request.learnerName}</span>
                  <span className="text-small text-grey-700">
                    {formatDate(startsAt)} at {formatTime(startsAt)}
                    {answerBy === null ? null : `. Answer by ${formatTime(answerBy)} on ${formatDate(answerBy)}`}
                  </span>
                </span>
                <StatusPill status="pending">Requested</StatusPill>
                <ChevronRight className="size-5 shrink-0 text-grey-700" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
