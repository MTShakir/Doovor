'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { avatarImage } from '@repo/core/images';
import { onboardingNameSchema } from '@repo/core/schemas/onboarding';
import { AvatarPicker } from '@repo/ui/avatar-picker';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareAvatar, type ImageProblem } from '@/lib/images/prepare';
import { avatarsBucket, avatarUrl, removeProfileImage, uploadProfileImage } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { saveName } from '../../actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

interface NameFormProps {
  profileId: string;
  initialName: string;
  initialPhotoPath: string | null;
}

export function NameForm({ profileId, initialName, initialPhotoPath }: NameFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  // undefined leaves the saved photo alone; null removes it.
  const [photoPath, setPhotoPath] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(avatarUrl(initialPhotoPath));
  // Uploads this page made but has not saved yet, so a replaced one is not left behind.
  const unsaved = useRef<string | null>(null);
  // No default values: the field keeps anything typed before hydration (ClientForm, D-043).
  const form = useForm<z.input<typeof onboardingNameSchema>>({ resolver: zodResolver(onboardingNameSchema) });

  useEffect(() => {
    // The preview is an address for bytes in this tab; let go of it when it changes.
    if (preview?.startsWith('blob:')) return () => { URL.revokeObjectURL(preview); };
    return undefined;
  }, [preview]);

  const choose = (file: File) => {
    setPhotoError(undefined);
    setWorking(true);
    void (async () => {
      const prepared = await prepareAvatar(file);
      if (!prepared.ok) {
        setPhotoError(photoProblem[prepared.problem]);
        setWorking(false);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const path = await uploadProfileImage(supabase, avatarsBucket, profileId, prepared.blob);
      if (!path) {
        setPhotoError('We could not upload that picture. Try again.');
        setWorking(false);
        return;
      }
      await removeProfileImage(supabase, avatarsBucket, unsaved.current);
      unsaved.current = path;
      setPhotoPath(path);
      setPreview(URL.createObjectURL(prepared.blob));
      setWorking(false);
    })();
  };

  const remove = () => {
    setPhotoError(undefined);
    setPhotoPath(null);
    setPreview(undefined);
    void (async () => {
      await removeProfileImage(getSupabaseBrowserClient(), avatarsBucket, unsaved.current);
      unsaved.current = null;
    })();
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // Saving redirects, so this only resolves when something needs fixing.
      const result = await saveName({ fullName: values.fullName, photoPath });
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof z.input<typeof onboardingNameSchema>, { message });
        }
      }
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-6">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <AvatarPicker
        name={initialName || 'Your photo'}
        src={preview}
        label="Your photo"
        hint="Learners are more likely to book an instructor they can see. You can add it later."
        accept={avatarImage.acceptedTypes.join(',')}
        busy={working}
        error={photoError}
        onChoose={choose}
        onRemove={remove}
      />
      <Field
        label="Your name"
        hint="Learners see this on your profile and in messages."
        error={form.formState.errors.fullName?.message}
      >
        <Input autoComplete="name" defaultValue={initialName} {...form.register('fullName')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
