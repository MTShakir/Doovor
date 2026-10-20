import { formatMinutes } from '@repo/core/time';
import type { LinkedDay } from '@/lib/school/linked-diary';

function summary(day: LinkedDay): string {
  if (day.parts.length === 0) return 'Free all day';
  if (day.allDay !== null) return day.allDay === 'away' ? 'Away all day' : 'Busy all day';
  return `Busy for ${formatMinutes(day.busyMinutes)}`;
}

/**
 * The instructors linked to a school, on its diary (M9-08, D-284): when each one is taken, so the
 * school knows when to send them a pupil. Their diary is their own, so it says when and nothing
 * about who with, what for or for how much.
 */
export function LinkedFreeBusy({ instructors }: { instructors: LinkedDay[] }) {
  return (
    <section aria-labelledby="linked-diary" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="linked-diary" className="text-h2 text-black">
          Linked instructors
        </h2>
        <p className="max-w-prose text-small text-grey-700">
          They keep their own diaries. You see when they are busy, never who with or what they charge.
        </p>
      </div>
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {instructors.map((instructor) => (
          <li key={instructor.instructorId} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-h3 text-black">{instructor.name}</h3>
              <span className="text-small text-grey-700">{summary(instructor)}</span>
            </div>
            <p className="text-small text-grey-700">{instructor.businessName}</p>
            {instructor.parts.length === 0 ? (
              <p className="rounded-card border border-dashed border-grey-200 p-3 text-small text-grey-700">Nothing booked</p>
            ) : (
              <ul className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white">
                {instructor.parts.map((part) => (
                  <li key={part.key} className="flex items-start gap-3 p-3">
                    <span className="w-14 shrink-0 text-small font-semibold text-ink tabular-nums">
                      {part.allDay ? (
                        'All day'
                      ) : (
                        <>
                          {part.from}
                          <span className="block font-normal text-grey-700">{part.to}</span>
                        </>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body font-semibold text-black">{part.kind === 'lesson' ? 'Booked' : 'Away'}</span>
                      <span className="text-small text-grey-700">
                        {part.kind === 'lesson' ? 'A lesson of their own' : 'Not taking lessons'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
