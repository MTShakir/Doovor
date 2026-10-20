'use client';

import type { LessonSeller } from '@repo/core/schemas/school';
import { cn } from '@repo/ui/lib/cn';
import { Building2, Handshake, Layers, type LucideIcon } from 'lucide-react';
import type { UseFormRegisterReturn } from 'react-hook-form';

export const lessonSellerOptions: { value: LessonSeller; title: string; description: string; icon: LucideIcon }[] = [
  {
    value: 'school',
    title: 'We sell the lessons',
    description: 'Instructors teach under the school. Learners pay the school, the school sets the prices, and you pay your instructors.',
    icon: Building2,
  },
  {
    value: 'instructors',
    title: 'Our instructors sell their own',
    description: 'Each instructor keeps their own business here, with their own prices, payments and learners. You send them pupils and charge them a fee.',
    icon: Handshake,
  },
  {
    value: 'both',
    title: 'Some of each',
    description: 'Some instructors teach under the school, and others sell their own lessons.',
    icon: Layers,
  },
];

/** Where HMRC says how it decides who sells a driving school's lessons. */
const hmrcDrivingSchools = 'https://www.gov.uk/hmrc-internal-manuals/vat-taxable-person/vtaxper66100';

/**
 * Who sells a school's lessons (D-281), as large radio cards like the ones that ask what brings
 * somebody here (AUTH-03): native radios, so they work with the keyboard and before scripts run.
 */
export function LessonSellerCards({
  field,
  defaultValue,
  error,
  idPrefix = '',
}: {
  /** The form's hold on the answer. */
  field: UseFormRegisterReturn;
  /** What the school said before, or null while it has said nothing. */
  defaultValue: LessonSeller | null;
  error?: string;
  idPrefix?: string;
}) {
  const why = `${idPrefix}lesson-seller-why`;
  const problem = `${idPrefix}lesson-seller-error`;
  return (
    // A fieldset will not shrink below its widest content unless told to, which at 200% text put
    // the cards past a phone's edge; the icon keeps its size in pixels, as the top bar does (D-304).
    <fieldset className="flex min-w-0 flex-col gap-3" aria-describedby={error ? `${problem} ${why}` : why}>
      <legend className="mb-1 text-small font-semibold text-ink">Who sells your lessons?</legend>
      {lessonSellerOptions.map(({ value, title, description, icon: Icon }) => (
        <label
          key={value}
          className={cn(
            'flex min-h-20 cursor-pointer items-center gap-4 rounded-card border-2 border-grey-200 bg-white p-4 transition-colors duration-200',
            'hover:border-grey-700 has-[:checked]:border-black has-[:checked]:bg-grey-100',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-black',
          )}
        >
          <input
            type="radio"
            value={value}
            className="sr-only"
            defaultChecked={defaultValue === value}
            {...field}
          />
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-full bg-white text-black shadow-card">
            <Icon size={24} strokeWidth={1.5} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 break-words">
            <span className="text-body font-semibold text-black">{title}</span>
            <span className="text-small text-grey-700">{description}</span>
          </span>
        </label>
      ))}
      {error ? (
        <p id={problem} role="alert" className="text-small font-medium text-red">
          {error}
        </p>
      ) : null}
      <p id={why} className="text-small text-grey-700">
        It decides who learners pay, and whose takings count for VAT.{' '}
        <a href={hmrcDrivingSchools} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue underline underline-offset-4">
          How HMRC sees driving schools
        </a>
      </p>
    </fieldset>
  );
}
