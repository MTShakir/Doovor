import { cn } from '../lib/cn';

export interface ProgressBarProps {
  /** 0 to 100 */
  value: number;
  label: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-grey-200', className)}
    >
      <div className="h-full rounded-full bg-black transition-[width] duration-200" style={{ width: `${String(clamped)}%` }} />
    </div>
  );
}

export interface ProgressRingProps {
  /** 0 to 100 */
  value: number;
  label: string;
  size?: number;
  className?: string;
}

/** Circular progress, for example the Today checklist (PRD 7.4). */
export function ProgressRing({ value, label, size = 56, className }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-grey-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="stroke-black transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <span className="absolute text-caption font-semibold tabular-nums">{Math.round(clamped)}%</span>
    </div>
  );
}
