'use client';

import { formatElapsed } from '@repo/core/lesson-records';
import { skillArea, skillAreas, type SkillCode, type SkillRating } from '@repo/core/skills';
import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Chip } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { RatingScale } from '@repo/ui/rating-scale';
import { toast } from '@repo/ui/toast';
import { MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { FormAlert } from '@/components/form-alert';
import { clearDraft, draftSnapshot, newDraft, parseDraft, saveDraft, subscribeToDrafts, type LessonDraft } from '@/lib/lessons/draft';
import type { TeachingLesson } from '@/lib/lessons/teaching';

type Step = 'lesson' | 'record';

export interface LessonScreenProps {
  lesson: TeachingLesson;
  /** Opened to write the record, rather than to teach the lesson (PRD 10.2 step 3). */
  startOnRecord: boolean;
}

/**
 * A lesson from the instructor's side (PRD 7.5, 10.2, PRG-01, M4-04, M4-05).
 *
 * While it is taught: how long it has been going, who it is with, and the skills to tap as they
 * come up. After: the same skills rated from 1 to 5, a line about the lesson and what to work on
 * next, saved in under a minute. Everything typed is kept on the phone until the record is saved,
 * so a reload or a lost signal loses nothing.
 */
export function LessonScreen({ lesson, startOnRecord }: LessonScreenProps) {
  const router = useRouter();
  const text = useSyncExternalStore(subscribeToDrafts, () => draftSnapshot(lesson.id), () => null);
  const draft = useMemo(() => parseDraft(text), [text]);
  const [step, setStep] = useState<Step>(startOnRecord ? 'record' : 'lesson');
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // On the record, the skills tapped during the lesson are rated first; the full list opens when asked for.
  const [picking, setPicking] = useState(false);

  const update = (change: Partial<LessonDraft>) => {
    saveDraft(lesson.id, { ...(parseDraft(draftSnapshot(lesson.id)) ?? newDraft()), ...change });
    // Whatever was missing may be there now: the next save says if it still is.
    setError(null);
  };

  // The draft starts the first time the lesson is opened, and the timer with it.
  useEffect(() => {
    const stamp = new Date().toISOString();
    const existing = parseDraft(draftSnapshot(lesson.id));
    if (existing === null) {
      saveDraft(lesson.id, { ...newDraft(), startedAt: stamp, formOpenedAt: step === 'record' ? stamp : null });
    } else if (step === 'record' && existing.formOpenedAt === null) {
      saveDraft(lesson.id, { ...existing, formOpenedAt: stamp });
    }
  }, [lesson.id, step]);

  useEffect(() => {
    if (step !== 'lesson') return;
    const timer = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { clearInterval(timer); };
  }, [step]);

  const startsAt = new Date(lesson.startsAt);
  const endsAt = new Date(lesson.endsAt);
  const skills = draft?.skills ?? [];

  const toggle = (code: SkillCode) => {
    update({ skills: skills.includes(code) ? skills.filter((one) => one !== code) : [...skills, code] });
    // The list stays open once somebody is choosing from it.
    setPicking(true);
  };

  const save = async () => {
    const current = parseDraft(draftSnapshot(lesson.id));
    if (current === null) return;
    const unrated = current.skills.filter((code) => current.ratings[code] === undefined);
    const missing =
      current.skills.length === 0
        ? 'Tap at least one skill you covered.'
        : unrated.length > 0
          ? `Rate ${unrated.map((code) => skillArea(code).name).join(', ')} from 1 to 5.`
          : current.summary.trim() === ''
            ? 'Write a line about the lesson.'
            : null;
    if (missing !== null) {
      setError(missing);
      return;
    }

    setPending(true);
    setError(null);
    const opened = current.formOpenedAt === null ? Date.now() : Date.parse(current.formOpenedAt);
    try {
      const response = await fetch('/api/v1/lesson-records', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: current.recordId,
          bookingId: lesson.id,
          ratings: current.skills.map((code) => ({ skillCode: code, rating: current.ratings[code] })),
          summary: current.summary,
          nextFocus: current.nextFocus,
          homework: current.homework,
          secondsTaken: Math.min(86400, Math.max(0, Math.round((Date.now() - opened) / 1000))),
        }),
      });
      const answer = (await response.json()) as { ok: boolean; code?: string; message?: string };
      if (answer.ok) {
        clearDraft(lesson.id);
        toast('Lesson record saved');
        router.push('/app/instructor');
        router.refresh();
        return;
      }
      setError(
        answer.code === 'ALREADY_RECORDED'
          ? 'This lesson already has a record, saved from another phone or tab. There is nothing more to do here.'
          : (answer.message ?? 'The record was not saved. Try again.'),
      );
    } catch {
      setError('The record could not be sent. Check you have signal and try again.');
    } finally {
      setPending(false);
    }
  };

  const heading = (
    <header className="flex flex-col gap-1">
      <p className="text-small font-semibold text-grey-700">{step === 'lesson' ? 'Lesson in progress' : 'Lesson record'}</p>
      <h1 className="text-h1 text-black">{lesson.learnerName}</h1>
      <p className="text-body text-grey-700">
        {lesson.lessonType}, {formatDate(startsAt)} at {formatTime(startsAt)} to {formatTime(endsAt)}
      </p>
      {lesson.pickup ? (
        <p className="flex items-center gap-1 text-small text-grey-700">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {lesson.pickup.label}
        </p>
      ) : null}
    </header>
  );

  const checklist = (
    <ul className="flex flex-wrap gap-2" aria-label="Skills">
      {skillAreas.map((area) => (
        <li key={area.code}>
          <Chip selected={skills.includes(area.code)} onClick={() => { toggle(area.code); }}>
            {area.name}
          </Chip>
        </li>
      ))}
    </ul>
  );

  if (step === 'lesson') {
    const startedAt = draft?.startedAt ? Date.parse(draft.startedAt) : now;
    return (
      <div className="flex flex-col gap-6 px-4 pt-4 pb-8 md:max-w-2xl md:px-8 md:pt-8" data-lesson-ready={draft === null ? undefined : 'yes'}>
        {heading}
        <section aria-label="Lesson time" className="flex flex-col items-center gap-1 rounded-card bg-grey-100 px-4 py-6">
          <p className="text-caption font-semibold text-grey-700">Lesson time</p>
          <p role="timer" className="text-display font-bold text-black tabular-nums">
            {formatElapsed((now - startedAt) / 1000)}
          </p>
          <p className="text-small text-grey-700">Booked until {formatTime(endsAt)}</p>
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="skills-covered">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="skills-covered" className="text-h3 text-black">
              Skills covered
            </h2>
            <p className="text-small text-grey-700">{skills.length === 1 ? '1 tapped' : `${String(skills.length)} tapped`}</p>
          </div>
          <p className="text-small text-grey-700">Tap each skill as you work on it. You rate them when the lesson ends.</p>
          {checklist}
        </section>
        <Button width="responsive" size="lg" onClick={() => { setStep('record'); window.scrollTo(0, 0); }}>
          Finish lesson
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pt-4 pb-8 md:max-w-2xl md:px-8 md:pt-8" data-lesson-ready={draft === null ? undefined : 'yes'}>
      {heading}
      <form
        className="flex flex-col gap-6"
        aria-label="Lesson record"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        {error ? <FormAlert>{error}</FormAlert> : null}

        <section className="flex flex-col gap-3" aria-labelledby="skills-rated">
          <h2 id="skills-rated" className="text-h3 text-black">
            Skills covered
          </h2>
          {skills.length === 0 ? <p className="text-small text-grey-700">Tap the skills you covered, then rate each one.</p> : null}
          {skills.length > 0 ? (
            <ul className="flex flex-col gap-4" aria-label="Ratings">
              {skills.map((code) => (
                <li key={code} className="flex flex-col gap-2">
                  <span className="text-body font-semibold text-black">{skillArea(code).name}</span>
                  <RatingScale
                    label={skillArea(code).name}
                    value={draft?.ratings[code] ?? null}
                    onChange={(rating: SkillRating) => { update({ ratings: { ...(draft?.ratings ?? {}), [code]: rating } }); }}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {picking || skills.length === 0 ? (
            <>
              {skills.length > 0 ? <p className="text-small text-grey-700">Tap a skill to add it or take it off.</p> : null}
              {checklist}
            </>
          ) : (
            <Button variant="secondary" width="responsive" onClick={() => { setPicking(true); }}>
              Add or change skills
            </Button>
          )}
        </section>

        <Field label="How did it go?" hint="One line is enough.">
          <Textarea
            name="summary"
            maxLength={500}
            rows={2}
            value={draft?.summary ?? ''}
            onChange={(event) => { update({ summary: event.target.value }); }}
          />
        </Field>
        <Field label="Focus for next time">
          <Input name="nextFocus" maxLength={300} value={draft?.nextFocus ?? ''} onChange={(event) => { update({ nextFocus: event.target.value }); }} />
        </Field>
        <Field label="Homework (optional)">
          <Input name="homework" maxLength={500} value={draft?.homework ?? ''} onChange={(event) => { update({ homework: event.target.value }); }} />
        </Field>

        <Button type="submit" width="responsive" size="lg" pending={pending} disabled={draft === null}>
          Save record
        </Button>
      </form>
    </div>
  );
}
