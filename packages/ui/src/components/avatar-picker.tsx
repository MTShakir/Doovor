'use client';

import { Camera } from 'lucide-react';
import { useId, useRef, type ChangeEvent } from 'react';
import { Avatar } from './avatar';
import { Button } from './button';

export interface AvatarPickerProps {
  /** Used for the initials shown until there is a picture. */
  name: string;
  /** The picture to show: a preview of the chosen file, or the one already saved. */
  src?: string | null;
  label: string;
  hint?: string;
  error?: string;
  /** Set while the picture is being prepared or uploaded. */
  busy?: boolean;
  /** File types the picker offers, as an accept attribute. */
  accept: string;
  onChoose: (file: File) => void;
  onRemove?: () => void;
}

/**
 * Picture picker built on the same Avatar people see everywhere else, so what they choose is
 * shown exactly as it will appear (INS-01).
 */
export function AvatarPicker({
  name,
  src,
  label,
  hint,
  error,
  busy = false,
  accept,
  onChoose,
  onRemove,
}: AvatarPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

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
      <div className="flex items-center gap-4">
        <span className="relative">
          <Avatar name={name} src={src} size="xl" />
          <span
            className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-black text-white ring-2 ring-white"
            aria-hidden
          >
            <Camera className="size-4" />
          </span>
        </span>
        <div className="flex flex-col items-start gap-1">
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
          <Button
            type="button"
            variant="secondary"
            pending={busy}
            onClick={() => input.current?.click()}
          >
            {src ? 'Change photo' : 'Add a photo'}
          </Button>
          {src && onRemove ? (
            <Button type="button" variant="tertiary" className="px-0" onClick={onRemove}>
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
