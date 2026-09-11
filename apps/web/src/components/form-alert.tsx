import { CircleAlert, CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';

/** Form-level message on white (D-009: red text only on white). */
export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'flex items-start gap-2 rounded-input border border-red bg-white p-3 text-small font-medium text-red'
          : 'flex items-start gap-2 rounded-input border border-black bg-white p-3 text-small font-medium text-ink'
      }
    >
      <Icon className="mt-0.5 shrink-0" size={18} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </div>
  );
}
