'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { avatarImage } from '@repo/core/images';
import {
  instructorProfileSchema,
  languages as languageOptions,
  specialisms as specialismOptions,
  transmissions,
  type Specialism,
} from '@repo/core/schemas/profile';
import { AvatarPicker } from '@repo/ui/avatar-picker';
import { Checkbox } from '@repo/ui/checkbox';
import { Chip } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareAvatar, type ImageProblem } from '@/lib/images/prepare';
import { avatarsBucket, avatarUrl, removeProfileImage, uploadProfileImage } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { saveProfile } from './actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

type Values = z.input<typeof instructorProfileSchema>;

export interface ProfileFormProps {
  profileId: string;
  photoPath: string | null;
  values: Values;
}

export function ProfileForm({ profileId, photoPath, values }: ProfileFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(avatarUrl(photoPath));
  const unsaved = useRef<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof instructorProfileSchema>>({
    resolver: zodResolver(instructorProfileSchema),
    // This form edits what is already there, so the fields start from it.
    defaultValues: values,
  });
  const { errors } = form.formState;

  useEffect(() => {
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
      setPhoto(path);
      setPreview(URL.createObjectURL(prepared.blob));
      setWorking(false);
    })();
  };

  const remove = () => {
    setPhotoError(undefined);
    setPhoto(null);
    setPreview(undefined);
    void (async () => {
      await removeProfileImage(getSupabaseBrowserClient(), avatarsBucket, unsaved.current);
      unsaved.current = null;
    })();
  };

  // handleSubmit is called from the event, not during render, so this handler may touch the
  // ref holding the upload that has not been saved yet.
  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void form.handleSubmit(() => {
      setFormError(null);
      startTransition(async () => {
        const result = await saveProfile(form.getValues(), photo);
        if (result.ok) {
          // Once a picture is saved it is no longer this page's to delete.
          unsaved.current = null;
          toast('Profile saved');
          return;
        }
        setFormError(result.fields ? null : result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof Values, { message });
        }
      });
    })();
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <AvatarPicker
        name={values.displayName || 'Your photo'}
        src={preview}
        label="Your photo"
        hint="Learners are more likely to book an instructor they can see."
        accept={avatarImage.acceptedTypes.join(',')}
        busy={working}
        error={photoError}
        onChoose={choose}
        onRemove={remove}
      />
      <Field label="Display name" hint="The name learners see." error={errors.displayName?.message}>
        <Input autoComplete="name" {...form.register('displayName')} />
      </Field>
      <Field label="About you" hint="Up to 300 characters." error={errors.bio?.message}>
        <Textarea rows={4} {...form.register('bio')} />
      </Field>

      <Controller
        control={form.control}
        name="languages"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small font-semibold text-ink">Languages you teach in</legend>
            <div className="flex flex-wrap gap-2 py-1">
              {languageOptions.map((language) => {
                const selected = field.value.includes(language);
                return (
                  <Chip
                    key={language}
                    selected={selected}
                    onClick={() => {
                      field.onChange(
                        selected ? field.value.filter((item) => item !== language) : [...field.value, language],
                      );
                    }}
                  >
                    {language}
                  </Chip>
                );
              })}
            </div>
            {errors.languages?.message ? (
              <p role="alert" className="text-small font-medium text-red">
                {errors.languages.message}
              </p>
            ) : null}
          </fieldset>
        )}
      />

      <Field label="Years teaching" error={errors.yearsTeaching?.message}>
        <Input inputMode="numeric" autoComplete="off" {...form.register('yearsTeaching')} />
      </Field>
      <Field label="Transmission" error={errors.transmission?.message}>
        <Select options={[...transmissions]} {...form.register('transmission')} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Car make" error={errors.carMake?.message}>
          <Input autoComplete="off" placeholder="Volkswagen" {...form.register('carMake')} />
        </Field>
        <Field label="Car model" error={errors.carModel?.message}>
          <Input autoComplete="off" placeholder="Polo" {...form.register('carModel')} />
        </Field>
      </div>
      <Controller
        control={form.control}
        name="dualControls"
        render={({ field }) => (
          <Checkbox
            label="My car has dual controls"
            description="Learners look for this."
            checked={field.value}
            onCheckedChange={(value) => { field.onChange(value === true); }}
          />
        )}
      />

      <Controller
        control={form.control}
        name="specialisms"
        render={({ field }) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-small font-semibold text-ink">What you specialise in</legend>
            <div className="flex flex-wrap gap-2 py-1">
              {specialismOptions.map((specialism) => {
                const selected = field.value.includes(specialism.value);
                return (
                  <Chip
                    key={specialism.value}
                    selected={selected}
                    onClick={() => {
                      field.onChange(
                        selected
                          ? field.value.filter((item: Specialism) => item !== specialism.value)
                          : [...field.value, specialism.value],
                      );
                    }}
                  >
                    {specialism.label}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
        )}
      />

      <SubmitButton width="responsive" size="lg" pending={pending} disabled={working}>
        Save profile
      </SubmitButton>
    </ClientForm>
  );
}
