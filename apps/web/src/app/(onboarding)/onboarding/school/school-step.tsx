import { StepProgress } from '@repo/ui/stepper';
import type { ReactNode } from 'react';

/** Setting up a school takes two screens: the school, then its instructors (AUTH-05). */
export const schoolSetupSteps = 2;

/** The frame both school setup screens share, as the instructor's onboarding has its own. */
export function SchoolStep({ current, title, lead, children }: { current: number; title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <StepProgress current={current} total={schoolSetupSteps} />
        <h1 className="text-h1 text-black">{title}</h1>
        {lead ? <p className="text-body text-grey-700">{lead}</p> : null}
      </div>
      {children}
    </div>
  );
}
