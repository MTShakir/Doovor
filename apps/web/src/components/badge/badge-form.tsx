'use client';

import { brand } from '@repo/config/brand';
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
import type { Result } from '@repo/core/result';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareBadge, type ImageProblem } from '@/lib/images/prepare';
import { badgesBucket, removeProfileImage, uploadProfileImage } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

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

/** A badge is checked from its photo, so it is never sent without one (INS-02, D-262). */
const photoNeeded = 'Add a photo of your badge';

interface BadgeFormProps {
  /** Sends it: onboarding's, which moves on to the next step, or the profile's (INS-02). */
  onSave: (values: Values & { badgePath: string | null | undefined }) => Promise<Result<null>>;
  /** After it is sent, where nothing else happens by itself: the profile closes its sheet. */
  onSaved?: () => void;
  submitLabel?: string;
  profileId: string;
  qualification: 'adi' | 'pdi';
  badgeNumber: string | null;
  badgeExpiry: string | null;
  /** A short-lived address for the badge photo already stored, if there is one. */
  badgePreview?: string;
  hasBadgePhoto: boolean;
}

export function BadgeForm({
  onSave,
  onSaved,
  submitLabel = 'Continue',
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
      const upload = await uploadProfileImage(supabase, badgesBucket, profileId, prepared.blob);
      if (!upload.ok) {
        // What the server said, rather than "try again" whatever happened (D-223).
        setPhotoError(upload.problem);
        setWorking(false);
        return;
      }
      const path = upload.path;
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

  // Asked whatever else is wrong, so every problem shows at once rather than one at a time.
  const checkPhoto = (): boolean => {
    if (stored || working) return true;
    setPhotoError(photoNeeded);
    return false;
  };

  const onSubmit = form.handleSubmit(
    (values) => {
      setFormError(null);
      if (!checkPhoto()) return;
      startTransition(async () => {
        // In onboarding a badge that is sent redirects, so this resolves there only when something
        // needs fixing.
        const result = await onSave({ ...values, badgePath });
        if (result.ok) {
          onSaved?.();
          return;
        }
        const fields = Object.entries(result.fields ?? {});
        // A problem with one field belongs beside that field, the photo's beside the photo.
        for (const [field, message] of fields) {
          if (field === 'badgePath') setPhotoError(message);
          else form.setError(field as keyof Values, { message });
        }
        // A badge belongs to one instructor, so a second account with the same number is either a
        // typo or somebody else's badge. The person reading this can only be one of the two, and
        // whichever they are, the next step is the same: tell us (INS-02, D-230).
        if (result.code === 'BADGE_TAKEN') {
          setFormError(
            `There is already an account with this badge number. If that is not you, email ${brand.supportEmail} with your badge number and photos of your badge.`,
          );
        } else if (fields.length === 0) {
          setFormError(result.message);
        }
      });
    },
    () => {
      checkPhoto();
    },
  );

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Your qualification" error={errors.qualification?.message}>
        <Select options={qualifications} defaultValue={qualification} {...form.register('qualification')} />
      </Field>
      <Field
        label="Badge number"
        hint="The number on your green ADI or pink PDI badge, usually 6 digits."
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
        {submitLabel}
      </SubmitButton>
    </ClientForm>
  );
}
