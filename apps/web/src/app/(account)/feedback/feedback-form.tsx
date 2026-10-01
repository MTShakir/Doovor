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
import { Check, ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareFeedbackImage, type ImageProblem } from '@/lib/images/prepare';
import { feedbackBucket, uploadFeedbackImage } from '@/lib/storage/images';
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
interface AddedPicture {
  /** Where it went in the bucket, which is what the Server Action is given. */
  path: string;
  /** A URL for the blob that was uploaded, so the thumbnail needs no round trip to a private
   *  bucket and no signed URL. Revoked when the picture goes or the form does. */
  preview: string;
}

export function FeedbackForm({ userId, onSent }: { userId: string; onSent?: () => void }) {
  const [sent, setSent] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [images, setImages] = useState<AddedPicture[]>([]);
  /** How many are on their way up, so each gets a tile of its own rather than one message. */
  const [adding, setAdding] = useState(0);
  const chooser = useRef<HTMLInputElement>(null);
  const working = adding > 0;
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
    const room = mostFeedbackImages - images.length - adding;
    const taking = [...files].slice(0, Math.max(0, room));
    if (taking.length === 0) return;
    setAdding((many) => many + taking.length);

    void (async () => {
      for (const file of taking) {
        const prepared = await prepareFeedbackImage(file);
        if (!prepared.ok) {
          setPhotoError(photoProblem[prepared.problem]);
          setAdding((many) => many - 1);
          continue;
        }
        const upload = await uploadFeedbackImage(getSupabaseBrowserClient(), userId, prepared.blob);
        if (!upload.ok) {
          setPhotoError(upload.problem);
          setAdding((many) => many - 1);
          continue;
        }
        // The blob that went up is the thumbnail, so nothing is fetched back out of a private
        // bucket to show somebody the picture they just chose.
        const preview = URL.createObjectURL(prepared.blob);
        setImages((had) => [...had, { path: upload.path, preview }].slice(0, mostFeedbackImages));
        setAdding((many) => many - 1);
      }
    })();
  };

  /**
   * Takes a picture off: out of the list, out of the bucket, and the preview URL let go.
   *
   * Leaving it in the bucket would leave somebody's screenshot in private storage attached to
   * nothing, which is a thing nobody could later find to delete.
   */
  const takeOff = (picture: AddedPicture) => {
    setImages((had) => had.filter((one) => one.path !== picture.path));
    URL.revokeObjectURL(picture.preview);
    void getSupabaseBrowserClient().storage.from(feedbackBucket).remove([picture.path]);
  };

  // Anything still held when the form goes, goes with it.
  useEffect(() => {
    return () => {
      for (const picture of images) URL.revokeObjectURL(picture.preview);
    };
    // Only on the way out: listing `images` would revoke a preview still on the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await sendFeedback({
        ...form.getValues(),
        images: images.map((picture) => picture.path),
        page: typeof window === 'undefined' ? '' : window.location.pathname,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      form.reset();
      for (const picture of images) URL.revokeObjectURL(picture.preview);
      setImages([]);
      setKind('feedback');
      setReference(result.data.reference);
      setSent(true);
      onSent?.();
      toast(`Thank you, that has reached us as ${result.data.reference}`);
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
        {reference === null ? null : (
          <div className="flex flex-col gap-1 rounded-card bg-quiet px-4 py-3">
            <span className="text-caption font-semibold tracking-wide text-grey-700 uppercase">Your reference</span>
            {/* The one thing on this card worth writing down, so it is the one thing set large. */}
            <span className="text-h3 text-black">{reference}</span>
            <span className="text-small text-grey-700">We have emailed this to you as well.</span>
          </div>
        )}
        <Button
          variant="secondary"
          width="full"
          onClick={() => {
            setReference(null);
            setSent(false);
          }}
        >
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
          hint={images.length === 0 && !working ? 'A screenshot often says it faster than a paragraph.' : undefined}
        >
          {/* Field gives its one child the id its label points at, so the input stays the child
              and everything else sits below it. */}
          <input
            ref={chooser}
            type="file"
            multiple
            accept={feedbackImage.acceptedTypes.join(',')}
            disabled={images.length + adding >= mostFeedbackImages}
            className="text-small text-ink file:mr-3 file:min-h-12 file:rounded-full file:border-0 file:bg-quiet file:px-4 file:font-semibold file:text-black"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) choose(event.target.files);
              // Cleared, so choosing the same file again after a failure still counts as a change.
              event.target.value = '';
            }}
          />
        </Field>
        {images.length > 0 || working ? (
          <ul className="-mt-2 flex flex-wrap gap-3" aria-label="Pictures added">
            {images.map((picture, index) => (
              <li key={picture.path} className="relative">
                {/* A plain img on purpose: the bucket is private and the source is a blob in this
                    tab, so there is nothing for an optimiser to fetch or cache. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={picture.preview}
                  alt={`Attachment ${String(index + 1)}`}
                  className="size-20 rounded-card border border-grey-200 object-cover"
                />
                <button
                  type="button"
                  aria-label={`Take off picture ${String(index + 1)}`}
                  onClick={() => {
                    takeOff(picture);
                  }}
                  className={[
                    'absolute -top-2 -right-2 inline-flex size-8 items-center justify-center rounded-full',
                    'border border-grey-200 bg-white text-black shadow-sm transition-colors duration-200',
                    'hover:bg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black',
                    // The cross is 32px so it does not cover the picture; the tap target is 48.
                    'after:absolute after:-inset-2 after:content-[""]',
                  ].join(' ')}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
            {/* One tile per picture on its way up, so three chosen at once look like three things
                happening rather than one word (PRD 7.4: skeletons, not spinners). */}
            {Array.from({ length: adding }, (_, index) => (
              <li
                key={`adding-${String(index)}`}
                className="flex size-20 animate-pulse flex-col items-center justify-center gap-1 rounded-card bg-quiet-strong"
              >
                <ImagePlus className="size-5 text-grey-700" aria-hidden />
                <span className="text-caption text-grey-700">Adding</span>
              </li>
            ))}
          </ul>
        ) : null}
        {working ? (
          <p className="-mt-2 text-small text-grey-700" role="status">
            {adding === 1 ? 'Adding your picture...' : `Adding ${String(adding)} pictures...`}
          </p>
        ) : null}
        <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
          Send it
        </SubmitButton>
      </ClientForm>
    </Card>
  );
}
