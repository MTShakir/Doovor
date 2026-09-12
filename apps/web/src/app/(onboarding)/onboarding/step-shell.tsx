import { StepProgress } from '@repo/ui/stepper';
import type { ReactNode } from 'react';
import { totalOnboardingSteps, type OnboardingStep } from '@/lib/onboarding/steps';

/** The frame every onboarding screen shares: progress at the top, then one question. */
export function StepShell({ step, children }: { step: OnboardingStep; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <StepProgress current={step.step} total={totalOnboardingSteps} />
        <h1 className="text-h1 text-black">{step.title}</h1>
      </div>
      {children}
    </div>
  );
}
