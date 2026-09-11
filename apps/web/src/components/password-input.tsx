'use client';

import { Input, type InputProps } from '@repo/ui/input';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

/** Password field with a show and hide toggle, which helps people on phones. */
export function PasswordInput(props: Omit<InputProps, 'type'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-14" />
      <button
        type="button"
        onClick={() => {
          setVisible((v) => !v);
        }}
        className="absolute top-0 right-0 flex size-12 items-center justify-center text-ink focus-visible:outline-2 focus-visible:outline-black"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={20} strokeWidth={1.5} aria-hidden /> : <Eye size={20} strokeWidth={1.5} aria-hidden />}
      </button>
    </div>
  );
}
