import { StepProgress } from '@repo/ui/stepper';
import type { ReactNode } from 'react';
import { stepPosition, type OnboardingStep } from '@/lib/onboarding/steps';

/** The frame every onboarding screen shares: progress at the top, then one question. */
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
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <StepProgress current={position.current} total={position.total} />
        <h1 className="text-h1 text-black">{step.title}</h1>
      </div>
      {children}
    </div>
  );
}
