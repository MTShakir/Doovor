import { StepProgress } from '@repo/ui/stepper';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { previousStep, stepPosition, stepTitle, type OnboardingStep } from '@/lib/onboarding/steps';

/**
 * The frame every onboarding screen shares: the way back, progress at the top, then one question.
 * Every screen after the first can go back to the one before it to change something, and carries
 * on from there in order (D-263).
 */
export function StepShell({
  step,
  businessType,
  children,
}: {
  step: OnboardingStep;
  businessType: 'independent' | 'school';
  children: ReactNode;
}) {
  const position = stepPosition(step, businessType);
  const back = previousStep(step.step, businessType);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {back ? (
          <Link
            href={`/onboarding/${back.slug}`}
            className="-ml-1 inline-flex min-h-12 items-center gap-1 self-start text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
          >
            <ChevronLeft className="size-5 shrink-0" aria-hidden />
            Back
          </Link>
        ) : null}
        <StepProgress current={position.current} total={position.total} />
        <h1 className="text-h1 text-black">{stepTitle(step, businessType)}</h1>
      </div>
      {children}
    </div>
  );
}
