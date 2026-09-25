'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { feedbackImage } from '@repo/core/images';
import {
  feedbackInputSchema,
  feedbackKindHints,
  feedbackKindLabels,
  feedbackKinds,
  mostFeedbackImages,
  type Feedback,
  type FeedbackInput,
  type FeedbackKind,
} from '@repo/core/schemas/feedback';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { Textarea } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { Check, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareFeedbackImage, type ImageProblem } from '@/lib/images/prepare';
import { uploadFeedbackImage } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { sendFeedback } from './actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

/**
 * D-202: a request, a problem, or anything else, with up to three pictures.
 *
 * The pictures go up as they are chosen rather than on send, because a phone on a bad signal
 * uploading three pictures after somebody presses the button is a button that looks broken.
 */
export function FeedbackForm({ userId }: { userId: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [images, setImages] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<FeedbackKind>('feedback');
  const form = useForm<FeedbackInput, unknown, Feedback>({
    resolver: zodResolver(feedbackInputSchema),
    defaultValues: { kind: 'feedback', message: '', images: [], page: '' },
  });
  const { errors } = form.formState;
  const kindField = form.register('kind');

  const choose = (files: FileList) => {
    setPhotoError(undefined);
    setWorking(true);
    void (async () => {
      const room = mostFeedbackImages - images.length;
      const added: string[] = [];
      for (const file of [...files].slice(0, Math.max(0, room))) {
        const prepared = await prepareFeedbackImage(file);
        if (!prepared.ok) {
          setPhotoError(photoProblem[prepared.problem]);
          continue;
        }
        const path = await uploadFeedbackImage(getSupabaseBrowserClient(), userId, prepared.blob);
        if (path === null) {
          setPhotoError('We could not upload that picture. Try again.');
          continue;
        }
        added.push(path);
      }
      if (added.length > 0) setImages((had) => [...had, ...added].slice(0, mostFeedbackImages));
      setWorking(false);
    })();
  };

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await sendFeedback({
        ...form.getValues(),
        images,
        page: typeof window === 'undefined' ? '' : window.location.pathname,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      form.reset();
      setImages([]);
      setKind('feedback');
      setSent(true);
      toast('Thank you, that has reached us');
    });
  });

  if (sent) {
    return (
      <Card className="flex flex-col gap-3" role="region" aria-labelledby="sent-title">
        <div className="flex items-start gap-3">
          <Check className="size-6 shrink-0 text-green" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle id="sent-title">That has reached us</CardTitle>
            <CardDescription>
              We read every one. If it needs an answer, we will get back to you on the email your account uses.
            </CardDescription>
          </div>
        </div>
        <Button variant="secondary" width="full" onClick={() => { setSent(false); }}>
          Send another
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field label="What is this about?" hint={feedbackKindHints[kind]}>
          <Select
            options={feedbackKinds.map((one) => ({ value: one, label: feedbackKindLabels[one] }))}
            {...kindField}
            onChange={(event) => {
              void kindField.onChange(event);
              setKind(event.target.value as FeedbackKind);
            }}
          />
        </Field>
        <Field
          label="Tell us about it"
          hint={kind === 'issue' ? 'What you were doing, what you expected, and what happened instead.' : undefined}
          error={errors.message?.message}
        >
          <Textarea rows={6} {...form.register('message')} />
        </Field>
        <Field
          label={`Pictures (optional, up to ${String(mostFeedbackImages)})`}
          error={photoError}
          hint={images.length === 0 ? 'A screenshot often says it faster than a paragraph.' : undefined}
        >
          <input
            type="file"
            multiple
            accept={feedbackImage.acceptedTypes.join(',')}
            disabled={images.length >= mostFeedbackImages}
            className="text-small text-ink file:mr-3 file:min-h-12 file:rounded-full file:border-0 file:bg-grey-100 file:px-4 file:font-semibold file:text-black"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) choose(event.target.files);
            }}
          />
        </Field>
        {images.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Pictures added">
            {images.map((path, index) => (
              <li key={path} className="flex items-center justify-between gap-3 rounded-card bg-grey-100 px-4 py-2">
                <span className="text-small text-ink">Picture {String(index + 1)}</span>
                <Button
                  variant="tertiary"
                  size="icon"
                  aria-label={`Take off picture ${String(index + 1)}`}
                  onClick={() => { setImages((had) => had.filter((one) => one !== path)); }}
                >
                  <X className="size-5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
          Send it
        </SubmitButton>
      </ClientForm>
    </Card>
  );
}
