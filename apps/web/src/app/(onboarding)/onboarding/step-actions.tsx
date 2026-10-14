import { Button } from '@repo/ui/button';
import { continueFromStep } from '../actions';

/**
 * Moves on without saving anything. Each step gains its own form, and its own skip, as it is
 * built (AUTH-04: everything but the name can be skipped).
 */
export function StepActions({ step }: { step: number }) {
  return (
    <form action={continueFromStep.bind(null, step)}>
      <Button type="submit" width="full" size="lg">
        Continue
      </Button>
    </form>
  );
}

/** The quieter version, for a step whose own form owns the primary action (PRD 7.1). */
export function StepSkip({ step }: { step: number }) {
  return (
    <form action={continueFromStep.bind(null, step)} className="flex justify-center">
      <Button type="submit" variant="tertiary">
        Skip for now
      </Button>
    </form>
  );
}
