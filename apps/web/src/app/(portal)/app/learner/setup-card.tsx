'use client';

import type { Result } from '@repo/core/result';
import { learnerTransmissions, theoryAnswers, type SetupStep } from '@repo/core/schemas/learner';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { LearnerSetup } from '@/lib/learner/setup';
import { saveMyGearbox, saveMyHealth, saveMyMedication, saveMyTheory, skipSetupStep } from './answers';

const yesNo = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

/** What each question asks, and what it says about itself before it is answered. */
const questions: Record<SetupStep, { title: string; why: string; label: string }> = {
  pickup: {
    title: 'Where do your lessons start?',
    why: 'Your instructor collects you from here, so they know where to be. You can save more than one and change them whenever you like.',
    label: 'Pickup point',
  },
  disability: {
    title: 'Do you have a disability, condition or learning difficulty?',
    why: 'Telling us helps your instructor plan lessons that suit you. It is never used to decide whether you can learn with us, and only your instructor and your school see it.',
    label: 'A disability or condition',
  },
  gearbox: {
    title: 'Which gearbox do you want to learn in?',
    why: 'It decides which car you are taught in, and which licence you end up with. Manual lets you drive both.',
    label: 'Gearbox',
  },
  medication: {
    title: 'Are you taking any medication?',
    why: 'Only tell us about medication that could affect your driving, such as something that makes you drowsy. Nothing else is our business.',
    label: 'Medication',
  },
  theory: {
    title: 'Have you passed your theory test?',
    why: 'A theory pass lasts two years, and you need one before you can book the driving test. Your instructor plans around it.',
    label: 'Theory test',
  },
};

/**
 * Getting started (LRN-02, D-183): the few things a learner is asked once they have signed up.
 *
 * One question at a time, so the screen they came for is still the first thing they see, and every
 * one of them can be skipped. Whatever is skipped is on their Account whenever they want it.
 */
export function SetupCard({ setup }: { setup: LearnerSetup }) {
  const step = setup.toAsk[0];
  const [answer, setAnswer] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (step === undefined) return null;
  const question = questions[step];

  const run = (action: () => Promise<Result<null>>, done: string) => {
    setErrors({});
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        const { form, ...fields } = result.fields ?? {};
        setErrors(fields);
        setError(form ?? (result.fields ? null : result.message));
        return;
      }
      setAnswer('');
      setDetails('');
      toast(done);
    });
  };

  const seen = 'Saved. Your instructor can see it.';
  const save = () => {
    if (step === 'disability') run(() => saveMyHealth({ hasDisability: answer, details }), seen);
    else if (step === 'medication') run(() => saveMyMedication({ takesMedication: answer, details }), seen);
    else if (step === 'gearbox') run(() => saveMyGearbox({ transmission: answer }), 'Saved');
    else run(() => saveMyTheory({ theory: answer }), 'Saved');
  };

  const left = setup.toAsk.length - 1;

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="setup-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="setup-title">Finish setting up</CardTitle>
        <CardDescription>
          {setup.answered} of {setup.total} done. Skip anything you would rather not answer: it is all on your Account later.
        </CardDescription>
      </div>

      {error ? <FormAlert>{error}</FormAlert> : null}

      {step === 'pickup' ? (
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium text-ink">{question.title}</p>
          <p className="text-small text-grey-700">{question.why}</p>
        </div>
      ) : (
        <Field label={question.title} hint={question.why} error={errors.hasDisability ?? errors.takesMedication ?? errors.transmission ?? errors.theory}>
          <Select
            options={step === 'gearbox' ? [...learnerTransmissions] : step === 'theory' ? [...theoryAnswers] : yesNo}
            placeholder="Choose an answer"
            value={answer}
            onChange={(event) => { setAnswer(event.target.value); }}
          />
        </Field>
      )}

      {answer === 'yes' && (step === 'disability' || step === 'medication') ? (
        <Field
          label={step === 'disability' ? 'What would help?' : 'What is it, and how does it affect you?'}
          hint={
            step === 'disability'
              ? 'For example: more time to take things in, written notes after a lesson, or a quieter route to start with.'
              : 'For example: tablets that can make me drowsy in the morning.'
          }
          error={errors.details}
        >
          <Textarea value={details} maxLength={1000} onChange={(event) => { setDetails(event.target.value); }} />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {step === 'pickup' ? (
          <Button asChild>
            <Link href="/app/learner/account/pickup-points">
              <MapPin className="size-5" aria-hidden />
              Add a pickup point
            </Link>
          </Button>
        ) : (
          <Button pending={pending} disabled={answer === ''} onClick={save}>
            Save
          </Button>
        )}
        <Button
          variant="tertiary"
          disabled={pending}
          onClick={() => { run(() => skipSetupStep({ step }), `Skipped. ${question.label} is on your Account whenever you want it.`); }}
        >
          Skip
        </Button>
        {left > 0 ? <span className="text-small text-grey-700">{left} more after this</span> : null}
      </div>
    </Card>
  );
}
