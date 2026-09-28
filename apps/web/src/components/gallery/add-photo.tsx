'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { galleryImage } from '@repo/core/images';
import { galleryPhotoSchema } from '@repo/core/schemas/gallery';
import { todayInZone } from '@repo/core/time';
import type { z } from '@repo/core/zod';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { PhotoUpload } from '@repo/ui/photo-upload';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareGalleryPhoto, type ImageProblem } from '@/lib/images/prepare';
import { uploadGalleryPhoto } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { addGalleryPhoto } from '@/app/(portal)/app/instructor/gallery/actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

/**
 * Adding one pass photo (D-218).
 *
 * The picture is prepared and uploaded here, in the browser, before anything is saved: that is
 * what takes the camera's position out of it, and a photo taken at a test centre carries the
 * position of that test centre.
 *
 * The learner is picked from the list where they are on it. Typing a name is the other way in,
 * because the photo is taken on the day and by then somebody who has passed is often already
 * marked as passed, or gone.
 */
export function AddPassPhoto({ businessId, learners }: { businessId: string; learners: { id: string; name: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [imagePath, setImagePath] = useState('');
  // No default values for anything a person could have typed before hydration (ClientForm,
  // D-043). The tick is the exception: nobody can tick a box before the JavaScript arrives, and
  // an unticked box has to be false rather than nothing at all.
  const form = useForm<z.input<typeof galleryPhotoSchema>>({
    resolver: zodResolver(galleryPhotoSchema),
    defaultValues: { consent: false },
  });

  const choose = (file: File) => {
    setPhotoError(undefined);
    setWorking(true);
    void (async () => {
      const prepared = await prepareGalleryPhoto(file);
      if (!prepared.ok) {
        setPhotoError(photoProblem[prepared.problem]);
        setWorking(false);
        return;
      }
      const path = await uploadGalleryPhoto(getSupabaseBrowserClient(), businessId, prepared.blob);
      if (!path) {
        setPhotoError('We could not upload that picture. Try again.');
        setWorking(false);
        return;
      }
      setImagePath(path);
      form.setValue('imagePath', path);
      setPreview(URL.createObjectURL(prepared.blob));
      setWorking(false);
    })();
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await addGalleryPhoto(values);
      if (!result.ok) {
        setFormError(result.fields ? null : result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof z.input<typeof galleryPhotoSchema>, { message });
        }
        return;
      }
      toast('Added to your gallery');
      // Clear what was said about the last attempt as well as the fields: a red line about
      // permission under an empty form that has just been accepted reads as a refusal.
      form.clearErrors();
      form.reset();
      setImagePath('');
      setPreview(undefined);
    });
  });

  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="add-photo-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="add-photo-title">Add a pass</CardTitle>
        <CardDescription>One photo, the day they passed, and who it is.</CardDescription>
      </div>

      <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
        {formError ? <FormAlert>{formError}</FormAlert> : null}

        {/* The picture is kept whole rather than cropped square: somebody holding a certificate
            does not fit in a square. */}
        <PhotoUpload
          label="The photo"
          hint="Taken on the day, with the certificate if you have it."
          error={photoError ?? form.formState.errors.imagePath?.message}
          src={preview}
          busy={working}
          accept={galleryImage.acceptedTypes.join(',')}
          onChoose={choose}
          onRemove={() => {
            setPreview(undefined);
            setImagePath('');
            form.setValue('imagePath', '');
          }}
        />
        <input type="hidden" {...form.register('imagePath')} value={imagePath} readOnly />

        <Field label="The day they passed" error={form.formState.errors.passedOn?.message}>
          <Input type="date" max={todayInZone()} {...form.register('passedOn')} />
        </Field>

        {learners.length === 0 ? null : (
          <Field label="Which learner?" hint="Or leave this and type a name below." error={form.formState.errors.learnerId?.message}>
            <Select
              options={[{ value: '', label: 'Someone not on my list' }, ...learners.map((one) => ({ value: one.id, label: one.name }))]}
              {...form.register('learnerId')}
            />
          </Field>
        )}

        <Field label="Their name" hint="Only needed for somebody who is not on your list." error={form.formState.errors.learnerName?.message}>
          <Input autoComplete="off" {...form.register('learnerName')} />
        </Field>

        {/* The whole of the consent (D-218): a named photograph of a person on a public page is
            theirs, and this is the instructor saying they asked. */}
        <Controller
          control={form.control}
          name="consent"
          render={({ field }) => (
            <Checkbox
              label="I have their permission to show this photo publicly"
              description="It goes on your public profile with their name and the date."
              checked={field.value}
              onCheckedChange={(value) => { field.onChange(value === true); }}
              aria-invalid={form.formState.errors.consent ? true : undefined}
            />
          )}
        />
        {form.formState.errors.consent?.message ? (
          <p role="alert" className="-mt-3 text-small font-medium text-red">
            {form.formState.errors.consent.message}
          </p>
        ) : null}

        <SubmitButton width="full" pending={pending} disabled={working}>
          Add to my gallery
        </SubmitButton>
      </ClientForm>
    </Card>
  );
}
