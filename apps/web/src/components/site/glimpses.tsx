import { StatusPill } from '@repo/ui/status-pill';
import { cn } from '@repo/ui/lib/cn';
import { Check, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Glimpses of the product for the site's pages (M5-09): the screens people will use, drawn in the
 * app's own components and tokens rather than as pictures, so they stay sharp, light and true to
 * the app. They repeat what the words beside them say, so they are hidden from screen readers.
 */

function Frame({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex w-full max-w-sm flex-col gap-4 rounded-card border border-grey-200 bg-white p-5 shadow-raised', className)}>
      <p className="text-h3 text-black">{title}</p>
      {children}
    </div>
  );
}

function Initials({ name, verified = false }: { name: string; verified?: boolean }) {
  const letters = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('');
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-grey-100 text-small font-semibold text-ink">
      {letters}
      {verified ? (
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-white bg-blue text-white">
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );
}

function FakeButton({ children }: { children: ReactNode }) {
  return <span className="flex h-12 w-full items-center justify-center rounded-full bg-black text-body font-semibold text-white">{children}</span>;
}

/** The instructor's Today (PRD 7.5): the day's lessons, who has paid, and the next one to start. */
export function TodayGlimpse({ className }: { className?: string }) {
  const lessons = [
    { time: '09:00', name: 'Jack Taylor', pickup: 'Headingley', status: 'paid' as const },
    { time: '10:30', name: 'Mia Wood', pickup: 'Hyde Park', status: 'credit' as const },
    { time: '13:00', name: 'Sam Hussain', pickup: 'Kirkstall', status: 'unpaid' as const },
  ];
  return (
    <Frame title="Today" className={className}>
      <ul className="flex flex-col divide-y divide-grey-200">
        {lessons.map((lesson) => (
          <li key={lesson.time} className="flex items-center gap-3 py-3">
            <span className="w-12 text-small font-semibold text-black tabular-nums">{lesson.time}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body font-semibold text-black">{lesson.name}</span>
              <span className="flex items-center gap-1 text-small text-grey-700">
                <MapPin size={14} strokeWidth={1.5} />
                {lesson.pickup}
              </span>
            </span>
            <StatusPill status={lesson.status} />
          </li>
        ))}
      </ul>
      <FakeButton>Start lesson</FakeButton>
    </Frame>
  );
}

/** A learner booking from the link (BOK-02): the instructor, the lesson, a time, and one button. */
export function BookingGlimpse({ className }: { className?: string }) {
  const times = [
    { time: '09:00', state: 'open' },
    { time: '10:30', state: 'chosen' },
    { time: '12:00', state: 'taken' },
    { time: '13:30', state: 'open' },
    { time: '15:00', state: 'open' },
    { time: '16:30', state: 'taken' },
  ] as const;
  return (
    <Frame title="Book a lesson" className={className}>
      <div className="flex items-center gap-3">
        <Initials name="Sarah Khan" verified />
        <span className="flex flex-col">
          <span className="text-body font-semibold text-black">Sarah Khan</span>
          <span className="text-small text-grey-700">Standard lesson, 1 hour, £42</span>
        </span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {times.map(({ time, state }) => (
          <li
            key={time}
            className={cn(
              'flex h-11 items-center justify-center gap-1 rounded-input text-small font-semibold tabular-nums',
              state === 'chosen' && 'border-2 border-black bg-yellow text-black',
              state === 'open' && 'bg-grey-100 text-black',
              state === 'taken' && 'text-grey-700 line-through',
            )}
          >
            {state === 'chosen' ? <Check size={14} strokeWidth={3} /> : null}
            {time}
          </li>
        ))}
      </ul>
      <FakeButton>Book lesson</FakeButton>
    </Frame>
  );
}

/** A learner's progress (PRG-03): the driving test report's areas, rated after each lesson. */
export function ProgressGlimpse({ className }: { className?: string }) {
  const skills = [
    { name: 'Use of mirrors', rating: 5 },
    { name: 'Junctions', rating: 4 },
    { name: 'Roundabouts', rating: 3 },
    { name: 'Reverse parking', rating: 2 },
  ];
  return (
    <Frame title="Your progress" className={className}>
      <ul className="flex flex-col gap-3">
        {skills.map((skill) => (
          <li key={skill.name} className="flex flex-col gap-1">
            <span className="flex justify-between text-small text-ink">
              <span>{skill.name}</span>
              <span className="font-semibold tabular-nums">{skill.rating} of 5</span>
            </span>
            <span className="flex h-2 gap-1">
              {[1, 2, 3, 4, 5].map((step) => (
                <span key={step} className={cn('flex-1 rounded-full', step <= skill.rating ? 'bg-black' : 'bg-grey-200')} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="rounded-input bg-grey-100 p-3 text-small text-ink">Good junctions, and mirrors checked early before every signal.</p>
    </Frame>
  );
}

/** The instructor's money this week (MNY-01). */
export function MoneyGlimpse({ className }: { className?: string }) {
  return (
    <Frame title="Money in this week" className={className}>
      <p className="text-display text-black tabular-nums">£640</p>
      <ul className="grid grid-cols-3 gap-2 text-small">
        {[
          { label: 'Card', amount: '£420' },
          { label: 'Cash', amount: '£140' },
          { label: 'Bank', amount: '£80' },
        ].map((way) => (
          <li key={way.label} className="flex flex-col rounded-input bg-grey-100 p-3">
            <span className="text-grey-700">{way.label}</span>
            <span className="font-semibold text-black tabular-nums">{way.amount}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-center justify-between text-small text-ink">
        Unpaid lessons
        <span className="font-semibold tabular-nums">£84</span>
      </p>
    </Frame>
  );
}

/** A school's overview (SCH-01): the day and the week, and who is teaching. */
export function SchoolGlimpse({ className }: { className?: string }) {
  const instructors = [
    { name: 'Emma Clarke', lessons: '6 lessons today' },
    { name: 'Tom Walsh', lessons: '5 lessons today' },
    { name: 'Aisha Rahman', lessons: 'Trainee, 4 lessons today' },
  ];
  return (
    <Frame title="Overview" className={className}>
      <ul className="grid grid-cols-2 gap-2">
        {[
          { label: 'Lessons today', value: '15', key: false },
          { label: 'This week', value: '84', key: false },
          { label: 'Instructors busy', value: '82%', key: true },
          { label: 'Unpaid', value: '£312', key: false },
        ].map((stat) => (
          <li key={stat.label} className={cn('flex flex-col rounded-input p-3', stat.key ? 'bg-yellow text-black' : 'bg-grey-100')}>
            <span className={cn('text-small', stat.key ? 'text-black' : 'text-grey-700')}>{stat.label}</span>
            <span className="text-h2 text-black tabular-nums">{stat.value}</span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col divide-y divide-grey-200">
        {instructors.map((instructor) => (
          <li key={instructor.name} className="flex items-center gap-3 py-2">
            <Initials name={instructor.name} verified />
            <span className="flex flex-col">
              <span className="text-small font-semibold text-black">{instructor.name}</span>
              <span className="text-caption text-grey-700">{instructor.lessons}</span>
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

/** Two glimpses, the second over the first one's last corner, as the hero of a page. */
export function GlimpsePair({ back, front }: { back: ReactNode; front: ReactNode }) {
  return (
    <div aria-hidden className="flex w-full max-w-md flex-col">
      <div className="mr-8 md:mr-16">{back}</div>
      <div className="-mt-12 ml-auto w-5/6 max-w-xs md:-mt-20 md:w-72">{front}</div>
    </div>
  );
}

export function GlimpseAlone({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="w-full max-w-md">
      {children}
    </div>
  );
}
