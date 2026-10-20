'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { lessonSellerChoiceSchema, type LessonSeller } from '@repo/core/schemas/school';
import type { Result } from '@repo/core/result';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { LessonSellerCards } from './lesson-seller-cards';

type Values = z.input<typeof lessonSellerChoiceSchema>;

/** The owner says who sells the school's lessons, from Settings (D-281). */
export function LessonSellerForm({
  current,
  onSave,
}: {
  current: LessonSeller | null;
  onSave: (values: Values) => Promise<Result<null>>;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof lessonSellerChoiceSchema>>({
    resolver: zodResolver(lessonSellerChoiceSchema),
    defaultValues: current === null ? {} : { lessonSeller: current },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSave(values);
      if (result.ok) {
        toast('Saved');
        return;
      }
      const problem = result.fields?.lessonSeller;
      if (problem) form.setError('lessonSeller', { message: problem });
      else setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <LessonSellerCards
        idPrefix="settings-"
        field={form.register('lessonSeller')}
        defaultValue={current}
        error={form.formState.errors.lessonSeller?.message}
      />
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save
      </SubmitButton>
    </ClientForm>
  );
}
