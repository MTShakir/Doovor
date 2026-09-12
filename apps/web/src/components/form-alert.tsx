import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'warning';

const icons = { error: CircleAlert, success: CircleCheck, warning: TriangleAlert };

/**
 * Form-level message on white (D-009: red text only on white, yellow always with black text).
 * A warning is something the person may go ahead with; an error is something they may not.
 */
export function FormAlert({ tone = 'error', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = icons[tone];
  const styles: Record<Tone, string> = {
    error: 'border-red bg-white text-red',
    success: 'border-black bg-white text-ink',
    warning: 'border-black bg-yellow text-black',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-input border p-3 text-small font-medium ${styles[tone]}`}
    >
      <Icon className="mt-0.5 shrink-0" size={18} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </div>
  );
}
