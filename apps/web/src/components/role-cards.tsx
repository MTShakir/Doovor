'use client';

import type { IntendedRole } from '@repo/core/schemas/auth';
import { cn } from '@repo/ui/lib/cn';
import { Building2, CarFront, GraduationCap, type LucideIcon } from 'lucide-react';

export const roleOptions: { value: IntendedRole; title: string; description: string; icon: LucideIcon }[] = [
  { value: 'learner', title: "I'm learning to drive", description: 'Book lessons, pay and track your progress.', icon: GraduationCap },
  { value: 'instructor', title: "I'm an instructor", description: 'Run your diary, learners and payments.', icon: CarFront },
  { value: 'school', title: 'I run a driving school', description: 'Manage your team, learners and money.', icon: Building2 },
];

/** Large radio cards (AUTH-03). Native radios, so they work with keyboard and without JS. */
export function RoleCards({
  name = 'role',
  value,
  defaultValue,
  onChange,
}: {
  name?: string;
  value?: IntendedRole | null;
  defaultValue?: IntendedRole;
  onChange?: (role: IntendedRole) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">What brings you here?</legend>
      {roleOptions.map(({ value: option, title, description, icon: Icon }) => (
        <label
          key={option}
          className={cn(
            'flex min-h-20 cursor-pointer items-center gap-4 rounded-card border-2 border-grey-200 bg-white p-4 transition-colors duration-200',
            'hover:border-grey-700 has-[:checked]:border-black has-[:checked]:bg-grey-100',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-black',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option}
            className="sr-only"
            required
            {...(value !== undefined ? { checked: value === option } : { defaultChecked: defaultValue === option })}
            onChange={() => onChange?.(option)}
          />
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-card">
            <Icon size={24} strokeWidth={1.5} aria-hidden />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-body font-semibold text-black">{title}</span>
            <span className="text-small text-grey-700">{description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
