'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  areaCheckSchema,
  captureTransmissions,
  lessonRequestConsent,
  lessonRequestSchema,
  requestDays,
  requestExperience,
  requestStarts,
  requestTimes,
  waitingListConsent,
  waitingListSchema,
  type CaptureKind,
} from '@repo/core/schemas/capture';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Chip } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { CircleCheck, MapPin } from 'lucide-react';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Controller, useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { checkArea, joinWaitingList, postLessonRequest, type AreaAnswer } from '@/lib/capture/actions';

/**
 * Coming soon (MKT-10, M5-10): a learner gives a postcode, hears whether they can find instructors
 * there yet, and where they cannot, joins the area's waiting list or posts a lesson request. The
 * heading of each step the learner moves to takes the focus, so a screen reader says where they are.
 */

export interface CapturePrefill {
  fullName?: string;
  email?: string;
}

type Stage =
  | { step: 'postcode' }
  | { step: 'area'; area: AreaAnswer }
  | { step: 'waiting_list'; area: AreaAnswer }
  | { step: 'lesson_request'; area: AreaAnswer }
  | { step: 'done'; kind: CaptureKind; area: AreaAnswer };

function StepHeading({ takeFocus, children }: { takeFocus: boolean; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus]);
  return (
    <h3 ref={heading} tabIndex={-1} className="text-h2 text-balance text-black outline-none">
      {children}
    </h3>
  );
}

/** Puts the server's refusals beside their fields, and anything else above the form. */
function useRefusals<T extends FieldValues, Output>(form: UseFormReturn<T, unknown, Output>) {
  const [formError, setFormError] = useState<string | null>(null);
  const apply = (result: { message: string; fields?: Record<string, string> }) => {
    setFormError(result.fields ? null : result.message);
    for (const [field, message] of Object.entries(result.fields ?? {})) form.setError(field as Path<T>, { message });
  };
  return { formError, clear: () => { setFormError(null); }, apply };
}

function PostcodeStep({ onFound }: { onFound: (area: AreaAnswer) => void }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof areaCheckSchema>, unknown, z.output<typeof areaCheckSchema>>({ resolver: zodResolver(areaCheckSchema) });
  const { formError, clear, apply } = useRefusals(form);
  const onSubmit = form.handleSubmit((values) => {
    clear();
    startTransition(async () => {
      const result = await checkArea(values);
      if (result.ok) onFound(result.data);
      else apply(result);
    });
  });
  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Field label="Your postcode" error={form.formState.errors.postcode?.message} className="sm:w-64">
          <Input autoComplete="postal-code" autoCapitalize="characters" spellCheck={false} className="uppercase" {...form.register('postcode')} />
        </Field>
        <SubmitButton size="lg" width="responsive" className="sm:mt-7" pending={pending}>
          Check my area
        </SubmitButton>
      </div>
    </ClientForm>
  );
}

export interface AreaPanelProps {
  area: AreaAnswer;
  onWaitingList: () => void;
  onLessonRequest: () => void;
  onChangePostcode: () => void;
  /** False where the panel is shown on its own, as on the design page. */
  takeFocus?: boolean;
}

/** What a learner can do where they are. Plain values in, so the design page can show it. */
export function AreaPanel({ area, onWaitingList, onLessonRequest, onChangePostcode, takeFocus = true }: AreaPanelProps) {
  const city = area.city;
  const cityLink =
    city && city.instructorCount > 0 ? (
      <a
        href={`/driving-lessons/${city.slug}`}
        className="inline-flex min-h-12 items-center gap-2 self-start text-body font-semibold text-blue underline underline-offset-4"
      >
        <MapPin className="size-5 shrink-0" aria-hidden />
        See the {city.instructorCount} {city.instructorCount === 1 ? 'instructor' : 'instructors'} we have checked in {city.name}
      </a>
    ) : null;

  if (area.open) {
    return (
      <div className="flex flex-col gap-3">
        <StepHeading takeFocus={takeFocus}>Learners near {area.postcode} can already book instructors</StepHeading>
        {cityLink}
        <Button variant="tertiary" className="self-start px-0" onClick={onChangePostcode}>
          Try another postcode
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHeading takeFocus={takeFocus}>Finding instructors near {area.postcode} is coming soon</StepHeading>
      <p className="max-w-prose text-body text-grey-700">
        Join the waiting list for {area.postcodeArea} and we will email you when it opens, or tell us the lessons you need and we will email
        you about them.
      </p>
      {cityLink}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" width="responsive" onClick={onWaitingList}>
          Join the waiting list
        </Button>
        <Button size="lg" width="responsive" variant="secondary" onClick={onLessonRequest}>
          Post a lesson request
        </Button>
      </div>
      <Button variant="tertiary" className="self-start px-0" onClick={onChangePostcode}>
        Change postcode
      </Button>
    </div>
  );
}

/** The box that says what a learner agrees to, in the words kept with what they give. */
function ConsentBox({ checked, onChange, words, error }: { checked: boolean; onChange: (checked: boolean) => void; words: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        label={words}
        checked={checked}
        onCheckedChange={(value) => {
          onChange(value === true);
        }}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-small font-medium text-red">{error}</p> : null}
    </div>
  );
}

function FormButtons({ pending, label, onBack }: { pending: boolean; label: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SubmitButton size="lg" width="responsive" pending={pending}>
        {label}
      </SubmitButton>
      <Button variant="tertiary" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

interface StepProps {
  area: AreaAnswer;
  prefill: CapturePrefill;
  onDone: () => void;
  onBack: () => void;
}

function WaitingListStep({ area, prefill, onDone, onBack }: StepProps) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof waitingListSchema>, unknown, z.output<typeof waitingListSchema>>({
    resolver: zodResolver(waitingListSchema),
    defaultValues: { postcode: area.postcode },
  });
  const { formError, clear, apply } = useRefusals(form);
  const { errors } = form.formState;
  // The server reads the form as it was filled in, so it is sent before the checks tidy it.
  const onSubmit = form.handleSubmit(() => {
    clear();
    startTransition(async () => {
      const result = await joinWaitingList(form.getValues());
      if (result.ok) onDone();
      else apply(result);
    });
  });
  return (
    <div className="flex flex-col gap-4">
      <StepHeading takeFocus>Join the waiting list for {area.postcodeArea}</StepHeading>
      <ClientForm onSubmit={onSubmit} pending={pending} className="flex max-w-xl flex-col gap-5">
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <Field label="Your name" error={errors.fullName?.message}>
          <Input autoComplete="name" defaultValue={prefill.fullName} {...form.register('fullName')} />
        </Field>
        <Field label="Your email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" spellCheck={false} defaultValue={prefill.email} {...form.register('email')} />
        </Field>
        <Field label="Which gearbox?" hint="Leave it if you do not mind." error={errors.transmission?.message}>
          <Select options={[...captureTransmissions]} placeholder="Either is fine" {...form.register('transmission')} />
        </Field>
        <Controller
          control={form.control}
          name="consent"
          render={({ field }) => (
            <ConsentBox checked={field.value} onChange={field.onChange} words={waitingListConsent(area.postcode)} error={errors.consent?.message} />
          )}
        />
        <FormButtons pending={pending} label="Join the waiting list" onBack={onBack} />
      </ClientForm>
    </div>
  );
}

function ChipChoices<T extends string | number>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-small font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2 pt-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <Chip
              key={String(option.value)}
              selected={selected}
              onClick={() => {
                onChange(selected ? value.filter((one) => one !== option.value) : [...value, option.value]);
              }}
            >
              {option.label}
            </Chip>
          );
        })}
      </div>
      {error ? <p className="text-small font-medium text-red">{error}</p> : null}
    </fieldset>
  );
}

function LessonRequestStep({ area, prefill, onDone, onBack }: StepProps) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.input<typeof lessonRequestSchema>, unknown, z.output<typeof lessonRequestSchema>>({
    resolver: zodResolver(lessonRequestSchema),
    defaultValues: { postcode: area.postcode, days: [], times: [] },
  });
  const { formError, clear, apply } = useRefusals(form);
  const { errors } = form.formState;
  // The server reads the form as it was filled in, so it is sent before the checks tidy it.
  const onSubmit = form.handleSubmit(() => {
    clear();
    startTransition(async () => {
      const result = await postLessonRequest(form.getValues());
      if (result.ok) onDone();
      else apply(result);
    });
  });
  return (
    <div className="flex flex-col gap-4">
      <StepHeading takeFocus>Tell us the lessons you need near {area.postcodeArea}</StepHeading>
      <ClientForm onSubmit={onSubmit} pending={pending} className="flex max-w-xl flex-col gap-5">
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <Field label="Your name" error={errors.fullName?.message}>
          <Input autoComplete="name" defaultValue={prefill.fullName} {...form.register('fullName')} />
        </Field>
        <Field label="Your email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" spellCheck={false} defaultValue={prefill.email} {...form.register('email')} />
        </Field>
        <Field label="Your mobile" hint="Optional." error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" {...form.register('phone')} />
        </Field>
        <Field label="Which gearbox?" error={errors.transmission?.message}>
          <Select options={[...captureTransmissions]} placeholder="Choose one" {...form.register('transmission')} />
        </Field>
        <Field label="How far along are you?" error={errors.experience?.message}>
          <Select options={[...requestExperience]} placeholder="Choose one" {...form.register('experience')} />
        </Field>
        <Controller
          control={form.control}
          name="days"
          render={({ field }) => (
            <ChipChoices label="Which days suit you?" options={requestDays} value={field.value} onChange={field.onChange} error={errors.days?.message} />
          )}
        />
        <Controller
          control={form.control}
          name="times"
          render={({ field }) => (
            <ChipChoices label="What time of day?" options={requestTimes} value={field.value} onChange={field.onChange} error={errors.times?.message} />
          )}
        />
        <Field label="When would you like to start?" error={errors.startWhen?.message}>
          <Select options={[...requestStarts]} placeholder="Choose one" {...form.register('startWhen')} />
        </Field>
        <Field label="The most you would pay for an hour" hint="Optional. In pounds, like 40." error={errors.budget?.message}>
          <Input inputMode="decimal" {...form.register('budget')} />
        </Field>
        <Controller
          control={form.control}
          name="consent"
          render={({ field }) => (
            <ConsentBox checked={field.value} onChange={field.onChange} words={lessonRequestConsent(area.postcode)} error={errors.consent?.message} />
          )}
        />
        <FormButtons pending={pending} label="Post my request" onBack={onBack} />
      </ClientForm>
    </div>
  );
}

export interface CaptureDoneProps {
  kind: CaptureKind;
  area: AreaAnswer;
  onOther: () => void;
  takeFocus?: boolean;
}

/** What was kept, and the other thing a learner could do. Plain values in, for the design page. */
export function CaptureDone({ kind, area, onOther, takeFocus = true }: CaptureDoneProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-1 size-7 shrink-0 text-black" aria-hidden />
        <StepHeading takeFocus={takeFocus}>
          {kind === 'waiting_list' ? `You are on the waiting list for ${area.postcodeArea}` : 'Your lesson request is in'}
        </StepHeading>
      </div>
      <p className="max-w-prose text-body text-grey-700">
        {kind === 'waiting_list'
          ? `We will email you when you can find and book instructors near ${area.postcodeArea}.`
          : `We will email you about it when instructors near ${area.postcodeArea} can take bookings through the app.`}{' '}
        Every email we send about it has a button to remove your details.
      </p>
      <Button variant="secondary" width="responsive" className="self-start" onClick={onOther}>
        {kind === 'waiting_list' ? 'Post a lesson request as well' : 'Join the waiting list as well'}
      </Button>
    </div>
  );
}

export function ComingSoon({ prefill = {} }: { prefill?: CapturePrefill }) {
  const [stage, setStage] = useState<Stage>({ step: 'postcode' });

  switch (stage.step) {
    case 'postcode':
      return (
        <PostcodeStep
          onFound={(area) => {
            setStage({ step: 'area', area });
          }}
        />
      );
    case 'area':
      return (
        <AreaPanel
          area={stage.area}
          onWaitingList={() => {
            setStage({ step: 'waiting_list', area: stage.area });
          }}
          onLessonRequest={() => {
            setStage({ step: 'lesson_request', area: stage.area });
          }}
          onChangePostcode={() => {
            setStage({ step: 'postcode' });
          }}
        />
      );
    case 'waiting_list':
    case 'lesson_request': {
      const Step = stage.step === 'waiting_list' ? WaitingListStep : LessonRequestStep;
      const kind = stage.step;
      return (
        <Step
          area={stage.area}
          prefill={prefill}
          onDone={() => {
            setStage({ step: 'done', kind, area: stage.area });
          }}
          onBack={() => {
            setStage({ step: 'area', area: stage.area });
          }}
        />
      );
    }
    case 'done':
      return (
        <CaptureDone
          kind={stage.kind}
          area={stage.area}
          onOther={() => {
            setStage({ step: stage.kind === 'waiting_list' ? 'lesson_request' : 'waiting_list', area: stage.area });
          }}
        />
      );
  }
}
