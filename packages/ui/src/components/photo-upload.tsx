'use client';

import { Camera, Check } from 'lucide-react';
import { useId, useRef, type ChangeEvent } from 'react';
import { Button } from './button';

export interface PhotoUploadProps {
  label: string;
  hint?: string;
  error?: string;
  /** A preview of the chosen picture, or a short-lived address for one already stored. */
  src?: string;
  /** True when a picture is stored but there is no address to draw it from. */
  stored?: boolean;
  /** What to say in that case. */
  storedLabel?: string;
  /** Set while the picture is being prepared or uploaded. */
  busy?: boolean;
  accept: string;
  onChoose: (file: File) => void;
  onRemove?: () => void;
}

/**
 * Picker for a picture of a document, kept whole rather than cropped square, because someone
 * has to read what is on it (INS-02).
 */
export function PhotoUpload({
  label,
  hint,
  error,
  src,
  stored = false,
  storedLabel = 'Photo added',
  busy = false,
  accept,
  onChoose,
  onRemove,
}: PhotoUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const chosen = Boolean(src) || stored;

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clearing the value lets someone pick the same file again after a failure.
    event.target.value = '';
    if (file) onChoose(file);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-small font-semibold text-ink" id={`${id}-label`}>
        {label}
      </span>
      {hint ? (
        <p id={hintId} className="text-small text-grey-700">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-col items-start gap-3">
        {src ? (
          <img
            src={src}
            alt=""
            className="max-h-56 w-full max-w-sm rounded-card border border-grey-200 object-contain"
          />
        ) : (
          <span className="flex h-32 w-full max-w-sm items-center justify-center gap-2 rounded-card border border-dashed border-grey-700 bg-grey-100 text-small text-grey-700">
            {chosen ? <Check className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
            {chosen ? storedLabel : 'No photo yet'}
          </span>
        )}
        <input
          ref={input}
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          aria-labelledby={`${id}-label`}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          onChange={choose}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" pending={busy} onClick={() => input.current?.click()}>
            {chosen ? 'Replace photo' : 'Add a photo'}
          </Button>
          {chosen && onRemove ? (
            <Button type="button" variant="tertiary" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-small font-medium text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
