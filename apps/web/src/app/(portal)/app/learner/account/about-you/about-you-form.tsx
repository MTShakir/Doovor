'use client';

import { learnerTransmissions, theoryAnswers } from '@repo/core/schemas/learner';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LearnerHealth } from '@/lib/learner/health';
import type { LearnerDriving } from '@/lib/learner/setup';
import { removeMyHealth, removeMyMedication, saveMyGearbox, saveMyHealth, saveMyMedication, saveMyTheory } from '../../answers';

const answers = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

/**
 * What a learner chooses to tell us about a disability (LRN-02, D-180): asked plainly, with why we
 * ask and who sees it beside the question, and theirs to change or take back at any time.
 */
export function AboutYouForm({ held }: { held: LearnerHealth | null }) {
  const [answer, setAnswer] = useState(held === null ? '' : held.hasDisability ? 'yes' : 'no');
  const [details, setDetails] = useState(held?.details ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setErrors({});
    setError(null);
    startTransition(async () => {
      const result = await saveMyHealth({ hasDisability: answer, details });
      if (!result.ok) {
        const { form, ...fields } = result.fields ?? {};
        setErrors(fields);
        setError(form ?? (result.fields ? null : result.message));
        return;
      }
      toast('Saved. Your instructor can see it.');
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeMyHealth();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAnswer('');
      setDetails('');
      toast('Taken off your record');
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="disability-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="disability-title">A disability or condition</CardTitle>
        <CardDescription>
          Telling us about a disability, health condition or learning difficulty helps your instructor plan lessons that suit you. It is
          your choice: you do not have to answer, and you can change it or take it off your record whenever you like. It is never used to
          decide whether you can learn with us.
        </CardDescription>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <Field label="Do you have a disability, condition or learning difficulty?" error={errors.hasDisability}>
        <Select
          options={answers}
          placeholder="Rather not say"
          value={answer}
          onChange={(event) => { setAnswer(event.target.value); }}
        />
      </Field>

      {answer === 'yes' ? (
        <Field
          label="What would help?"
          hint="For example: more time to take things in, written notes after a lesson, or a quieter route to start with."
          error={errors.details}
        >
          <Textarea value={details} maxLength={1000} onChange={(event) => { setDetails(event.target.value); }} />
        </Field>
      ) : null}

      <p className="text-small text-grey-700">
        Who sees it: the instructor who teaches you, and whoever runs the school you learn with. Nobody else. It is kept apart from the
        rest of your details, and it goes with your account if you close it.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button pending={pending} disabled={answer === ''} onClick={save}>
          Save
        </Button>
        {held === null ? null : (
          <Button variant="tertiary" disabled={pending} onClick={remove}>
            Take it off my record
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Medication that could affect their driving (LRN-02, D-183). Health data like the answer above,
 * kept in the same place and read by the same people, and asked for only where it matters.
 */
export function MedicationForm({ held }: { held: LearnerHealth | null }) {
  const [answer, setAnswer] = useState(held?.takesMedication === null || held === null ? '' : held.takesMedication ? 'yes' : 'no');
  const [details, setDetails] = useState(held?.medicationDetails ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setErrors({});
    setError(null);
    startTransition(async () => {
      const result = await saveMyMedication({ takesMedication: answer, details });
      if (!result.ok) {
        const { form, ...fields } = result.fields ?? {};
        setErrors(fields);
        setError(form ?? (result.fields ? null : result.message));
        return;
      }
      toast('Saved. Your instructor can see it.');
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeMyMedication();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAnswer('');
      setDetails('');
      toast('Taken off your record');
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="medication-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="medication-title">Medication</CardTitle>
        <CardDescription>
          Only tell us about medication that could affect your driving, such as something that makes you drowsy. Nothing else is our
          business. It is your choice, and you can take it off your record whenever you like.
        </CardDescription>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <Field label="Are you taking any medication that could affect your driving?" error={errors.takesMedication}>
        <Select options={answers} placeholder="Rather not say" value={answer} onChange={(event) => { setAnswer(event.target.value); }} />
      </Field>

      {answer === 'yes' ? (
        <Field
          label="What is it, and how does it affect you?"
          hint="For example: tablets that can make me drowsy in the morning."
          error={errors.details}
        >
          <Textarea value={details} maxLength={1000} onChange={(event) => { setDetails(event.target.value); }} />
        </Field>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button pending={pending} disabled={answer === ''} onClick={save}>
          Save
        </Button>
        {held?.takesMedication === null || held === null ? null : (
          <Button variant="tertiary" disabled={pending} onClick={remove}>
            Take it off my record
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The gearbox their lessons are in, and whether the theory test is behind them (LRN-02, D-183). */
export function DrivingForm({ driving }: { driving: LearnerDriving }) {
  const [gearbox, setGearbox] = useState<string>(driving.transmission ?? '');
  const [theory, setTheory] = useState(driving.theoryPassed === null ? '' : driving.theoryPassed ? 'passed' : 'not_yet');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (what: 'gearbox' | 'theory', value: string) => {
    if (what === 'gearbox') setGearbox(value);
    else setTheory(value);
    setError(null);
    startTransition(async () => {
      const result = what === 'gearbox' ? await saveMyGearbox({ transmission: value }) : await saveMyTheory({ theory: value });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast('Saved');
    });
  };

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="driving-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="driving-title">Your driving</CardTitle>
        <CardDescription>What your instructor plans your lessons around. Change it whenever it changes.</CardDescription>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      <Field label="Which gearbox do you want to learn in?" hint="Manual lets you drive both once you pass.">
        <Select
          options={[...learnerTransmissions]}
          placeholder="Not said yet"
          value={gearbox}
          disabled={pending}
          onChange={(event) => { change('gearbox', event.target.value); }}
        />
      </Field>

      <Field label="Have you passed your theory test?" hint="A theory pass lasts two years, and you need one before you book the driving test.">
        <Select
          options={[...theoryAnswers]}
          placeholder="Not said yet"
          value={theory}
          disabled={pending}
          onChange={(event) => { change('theory', event.target.value); }}
        />
      </Field>
    </Card>
  );
}
