'use client';

import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { cn } from '../lib/cn';

export interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

function Slot({ char, isActive, hasFakeCaret, invalid }: SlotProps & { invalid: boolean }) {
  return (
    <div
      className={cn(
        'relative flex h-14 w-12 items-center justify-center rounded-input border bg-grey-100 text-h2 tabular-nums',
        invalid ? 'border-red bg-white' : 'border-grey-700',
        isActive && 'border-black bg-white outline-2 outline-black',
      )}
    >
      {char}
      {hasFakeCaret ? <span className="absolute h-6 w-px animate-pulse bg-black" aria-hidden /> : null}
    </div>
  );
}

/** Six-digit SMS or authenticator code. Supports paste and iOS/Android one-time-code autofill. */
export function OtpInput({ value, onChange, onComplete, length = 6, disabled, invalid, ...aria }: OtpInputProps) {
  const isInvalid = invalid ?? aria['aria-invalid'] ?? false;
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      disabled={disabled}
      containerClassName="flex gap-2"
      {...aria}
      render={({ slots }) => (
        <>
          {slots.map((slot, index) => (
            // Slots are positional and never reorder, so the index is a stable key.
            <Slot key={index} {...slot} invalid={isInvalid} />
          ))}
        </>
      )}
    />
  );
}
