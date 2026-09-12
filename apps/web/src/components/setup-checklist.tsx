import { setupProgress, setupTasks, type SetupState, type SetupTaskId } from '@repo/core/setup-checklist';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { ProgressRing } from '@repo/ui/progress';
import { Check, ChevronRight, Clock } from 'lucide-react';
import { hrefFor } from '@/lib/navigation';
import { NavLink } from './nav-link';

interface TaskCopy {
  title: string;
  todo: string;
  done: string;
  /** Instructor portal section the row opens. */
  section: string;
  /** What to say while something else has to happen first. */
  blocked?: string;
}

const copy: Record<SetupTaskId, TaskCopy> = {
  'first-learner': {
    title: 'Add your first learner',
    todo: 'Invite them by text, WhatsApp or email.',
    done: 'Your first learner is on board.',
    section: 'learners',
  },
  'connect-payments': {
    title: 'Connect payments',
    todo: 'Take card payments and get paid out automatically.',
    done: 'Payments are connected.',
    section: 'money',
  },
  'booking-link': {
    title: 'Share your booking link',
    todo: 'Put it in your bio, your car and your messages.',
    done: 'Your booking link is live.',
    blocked: 'Ready as soon as your badge is approved.',
    section: 'profile',
  },
};

/**
 * The first thing a new instructor sees on Today (PRD 10.1, M1-10). Every row is worked out
 * from something real, and the card disappears when the list is finished.
 */
export function SetupChecklist({ state }: { state: SetupState }) {
  const tasks = setupTasks(state);
  const progress = setupProgress(state);

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <ProgressRing value={progress.percent} label="Setup checklist" size={56} />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>Finish setting up</CardTitle>
          <CardDescription>
            {progress.done} of {progress.total} done. It takes a couple of minutes.
          </CardDescription>
        </div>
      </div>
      <ul className="border-t border-grey-200">
        {tasks.map((task) => {
          const text = copy[task.id];
          const subtitle = task.done ? text.done : (task.blockedBy ? text.blocked : text.todo);
          return (
            <li key={task.id} className="border-b border-grey-200 last:border-b-0">
              <NavLink
                href={hrefFor('instructor', text.section)}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-grey-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-black"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                    task.done ? 'bg-black text-white' : 'border border-grey-700 text-grey-700'
                  }`}
                  aria-hidden
                >
                  {task.done ? <Check className="size-4" strokeWidth={3} /> : null}
                  {!task.done && task.blockedBy ? <Clock className="size-3.5" /> : null}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-semibold text-black">{text.title}</span>
                  <span className="text-small text-grey-700">{subtitle}</span>
                </span>
                <span className="sr-only">{task.done ? 'Done' : 'Not done yet'}</span>
                <ChevronRight className="ml-auto size-5 shrink-0 text-grey-700" aria-hidden />
              </NavLink>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
