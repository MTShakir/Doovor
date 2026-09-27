import { formatLessonLength } from '@repo/core/time';

/**
 * How long a lesson is, as a small grey badge on its card (D-211).
 *
 * UX: the cards showed a start and an end time and left the instructor to subtract one from the
 * other, on every card, every time. A lesson's length is the thing that decides whether it fits
 * before the next one, so it is written down rather than worked out.
 *
 * Grey rather than coloured: it is information, not a state. The status pill is the only thing on
 * these cards that carries colour.
 */
export function LessonLength({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  const minutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
  if (minutes <= 0) return null;
  return (
    <span className="inline-flex min-h-5 w-fit items-center rounded-full bg-grey-100 px-2 py-0.5 text-caption font-semibold text-grey-700 tabular-nums">
      {formatLessonLength(minutes)}
    </span>
  );
}
