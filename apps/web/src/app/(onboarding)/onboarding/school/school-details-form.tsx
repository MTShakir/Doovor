'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { avatarImage } from '@repo/core/images';
import { schoolDetailsSchema } from '@repo/core/schemas/school';
import { AvatarPicker } from '@repo/ui/avatar-picker';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareAvatar, type ImageProblem } from '@/lib/images/prepare';
import { avatarsBucket, avatarUrl, removeProfileImage, uploadBusinessLogo } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { saveSchoolDetails } from './actions';

const logoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

type Values = z.input<typeof schoolDetailsSchema>;

interface SchoolDetailsFormProps {
  businessId: string;
  initialName: string;
  initialLogoPath: string | null;
  initialPostcode: string | null;
  initialExpectedInstructors: number | null;
}

export function SchoolDetailsForm({
  businessId,
  initialName,
  initialLogoPath,
  initialPostcode,
  initialExpectedInstructors,
}: SchoolDetailsFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  // undefined leaves the saved logo alone; null removes it.
  const [logoPath, setLogoPath] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(avatarUrl(initialLogoPath));
  // An upload this page made but has not saved yet, so a replaced one is not left behind.
  const unsaved = useRef<string | null>(null);
  // No default values: the fields keep anything typed before hydration (ClientForm, D-043).
  const form = useForm<Values, unknown, z.output<typeof schoolDetailsSchema>>({ resolver: zodResolver(schoolDetailsSchema) });

  useEffect(() => {
    // The preview is an address for bytes in this tab; let go of it when it changes.
    if (preview?.startsWith('blob:')) return () => { URL.revokeObjectURL(preview); };
    return undefined;
  }, [preview]);

  const choose = (file: File) => {
    setLogoError(undefined);
    setWorking(true);
    void (async () => {
      const prepared = await prepareAvatar(file);
      if (!prepared.ok) {
        setLogoError(logoProblem[prepared.problem]);
        setWorking(false);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const path = await uploadBusinessLogo(supabase, businessId, prepared.blob);
      if (!path) {
        setLogoError('We could not upload that picture. Try again.');
        setWorking(false);
        return;
      }
      await removeProfileImage(supabase, avatarsBucket, unsaved.current);
      unsaved.current = path;
      setLogoPath(path);
      setPreview(URL.createObjectURL(prepared.blob));
      setWorking(false);
    })();
  };

  const remove = () => {
    setLogoError(undefined);
    setLogoPath(null);
    setPreview(undefined);
    void (async () => {
      await removeProfileImage(getSupabaseBrowserClient(), avatarsBucket, unsaved.current);
      unsaved.current = null;
    })();
  };

  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      // The server parses what was typed itself; saving redirects, so this only resolves when
      // something needs fixing.
      const result = await saveSchoolDetails({ ...form.getValues(), logoPath });
      if (!result.ok) {
        if (!result.fields) setFormError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof Values, { message });
        }
      }
    });
  });

  const { errors } = form.formState;

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-6">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <AvatarPicker
        name={initialName || 'Your school'}
        src={preview}
        label="Logo"
        noun="logo"
        hint="Shown on your school's page. You can add it later."
        accept={avatarImage.acceptedTypes.join(',')}
        busy={working}
        error={logoError}
        onChoose={choose}
        onRemove={remove}
      />
      <Field label="School name" error={errors.name?.message}>
        <Input autoComplete="organization" defaultValue={initialName} {...form.register('name')} />
      </Field>
      <Field
        label="Main postcode"
        hint="Where the school is based. Learners see the area, never the full postcode."
        error={errors.postcode?.message}
      >
        <Input
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="uppercase"
          defaultValue={initialPostcode ?? ''}
          {...form.register('postcode')}
        />
      </Field>
      <Field label="How many instructors teach for you?" hint="Roughly is fine." error={errors.expectedInstructors?.message}>
        <Input
          inputMode="numeric"
          autoComplete="off"
          className="max-w-32"
          defaultValue={initialExpectedInstructors === null ? '' : String(initialExpectedInstructors)}
          {...form.register('expectedInstructors')}
        />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
