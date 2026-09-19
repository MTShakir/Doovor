'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { badgeImage } from '@repo/core/images';
import { onboardingBadgeSchema } from '@repo/core/schemas/onboarding';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { PhotoUpload } from '@repo/ui/photo-upload';
import { Select } from '@repo/ui/select';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from '@repo/core/zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareBadge, type ImageProblem } from '@/lib/images/prepare';
import { badgesBucket, removeProfileImage, uploadProfileImage } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { saveBadge } from '../../actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

const qualifications = [
  { value: 'adi', label: 'Approved driving instructor (ADI)' },
  { value: 'pdi', label: 'Trainee instructor (PDI)' },
];

type Values = z.input<typeof onboardingBadgeSchema>;

interface BadgeFormProps {
  profileId: string;
  qualification: 'adi' | 'pdi';
  badgeNumber: string | null;
  badgeExpiry: string | null;
  /** A short-lived address for the badge photo already stored, if there is one. */
  badgePreview?: string;
  hasBadgePhoto: boolean;
}

export function BadgeForm({
  profileId,
  qualification,
  badgeNumber,
  badgeExpiry,
  badgePreview,
  hasBadgePhoto,
}: BadgeFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [badgePath, setBadgePath] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | undefined>(badgePreview);
  const [stored, setStored] = useState(hasBadgePhoto);
  const unsaved = useRef<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(onboardingBadgeSchema),
    // The tick is a button, not a native checkbox, so there is nothing to keep from before
    // hydration; the text fields have no defaults for that reason (D-043).
    defaultValues: { dbsConfirmed: false },
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
      const prepared = await prepareBadge(file);
      if (!prepared.ok) {
        setPhotoError(photoProblem[prepared.problem]);
        setWorking(false);
        return;
      }
      const supabase = getSupabaseBrowserClient();
      const path = await uploadProfileImage(supabase, badgesBucket, profileId, prepared.blob);
      if (!path) {
        setPhotoError('We could not upload that picture. Try again.');
        setWorking(false);
        return;
      }
      await removeProfileImage(supabase, badgesBucket, unsaved.current);
      unsaved.current = path;
      setBadgePath(path);
      setPreview(URL.createObjectURL(prepared.blob));
      setStored(true);
      setWorking(false);
    })();
  };

  const remove = () => {
    setPhotoError(undefined);
    setBadgePath(null);
    setPreview(undefined);
    setStored(false);
    void (async () => {
      await removeProfileImage(getSupabaseBrowserClient(), badgesBucket, unsaved.current);
      unsaved.current = null;
    })();
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // Submitting redirects, so this only resolves when something needs fixing.
      const result = await saveBadge({ ...values, badgePath });
      if (!result.ok) {
        setFormError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof Values, { message });
        }
      }
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Your qualification" error={errors.qualification?.message}>
        <Select options={qualifications} defaultValue={qualification} {...form.register('qualification')} />
      </Field>
      <Field
        label="Badge number"
        hint="The number printed on your green ADI or pink PDI badge."
        error={errors.badgeNumber?.message}
      >
        <Input inputMode="numeric" autoComplete="off" defaultValue={badgeNumber ?? ''} {...form.register('badgeNumber')} />
      </Field>
      <Field label="Badge expiry date" error={errors.badgeExpiry?.message}>
        <Input type="date" defaultValue={badgeExpiry ?? ''} {...form.register('badgeExpiry')} />
      </Field>
      <PhotoUpload
        label="Photo of your badge"
        hint="We check the number against the DVSA register. Nobody else can see this photo."
        accept={badgeImage.acceptedTypes.join(',')}
        src={preview}
        stored={stored}
        storedLabel="Badge photo added"
        busy={working}
        error={photoError}
        onChoose={choose}
        onRemove={remove}
      />
      <Controller
        control={form.control}
        name="dbsConfirmed"
        render={({ field }) => (
          <Checkbox
            label="I have a current enhanced DBS check"
            description="Teaching a learner requires one. We may ask to see it."
            checked={field.value}
            onCheckedChange={(value) => { field.onChange(value === true); }}
            aria-invalid={errors.dbsConfirmed ? true : undefined}
          />
        )}
      />
      {errors.dbsConfirmed?.message ? (
        <p role="alert" className="-mt-3 text-small font-medium text-red">
          {errors.dbsConfirmed.message}
        </p>
      ) : null}
      <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
