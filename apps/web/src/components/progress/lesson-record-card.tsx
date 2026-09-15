import { skillArea } from '@repo/core/skills';
import { formatDate, formatDateWithYear, formatTime, todayInZone } from '@repo/core/time';
import { SkillBar } from '@repo/ui/skill-bar';
import type { RecordedLesson } from '@/lib/lessons/records';

/** "Tue 15 Sep at 07:00", with the year for a lesson in another year than `thisYear`. */
export function lessonWhen(lessonStartsAt: string, thisYear: string): string {
  const at = new Date(lessonStartsAt);
  const day = todayInZone(at).startsWith(thisYear) ? formatDate(at) : formatDateWithYear(at);
  return `${day} at ${formatTime(at)}`;
}

/**
 * One lesson record, as the learner and the people teaching them read it (PRG-01, PRG-03, M4-06):
 * when and with whom, what the instructor wrote, each skill rated, and what comes next.
 */
export function LessonRecordCard({ record, thisYear }: { record: RecordedLesson; thisYear: string }) {
  const when = lessonWhen(record.lessonStartsAt, thisYear);
  const titleId = `lesson-record-${record.id}`;

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-4 rounded-card border border-grey-200 bg-white p-4">
      <header className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-h3 text-black">
          {when}
        </h3>
        <p className="text-small text-grey-700">
          {record.schoolName === null ? record.instructorName : `${record.instructorName} · ${record.schoolName}`}
        </p>
      </header>

      <p className="text-body whitespace-pre-line text-ink">{record.summary}</p>

      <ul aria-label="Skills rated" className="flex flex-col gap-3">
        {record.ratings.map((one) => (
          <li key={one.skillCode}>
            <SkillBar skill={skillArea(one.skillCode).name} rating={one.rating} />
          </li>
        ))}
      </ul>

      {record.nextFocus === null && record.homework === null ? null : (
        <dl className="flex flex-col gap-3 border-t border-grey-200 pt-3">
          {record.nextFocus === null ? null : (
            <div className="flex flex-col gap-0.5">
              <dt className="text-small text-grey-700">Focus for next time</dt>
              <dd className="text-body text-ink">{record.nextFocus}</dd>
            </div>
          )}
          {record.homework === null ? null : (
            <div className="flex flex-col gap-0.5">
              <dt className="text-small text-grey-700">Homework</dt>
              <dd className="text-body whitespace-pre-line text-ink">{record.homework}</dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}
