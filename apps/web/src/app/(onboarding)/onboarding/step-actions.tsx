import { Button } from '@repo/ui/button';
import { continueFromStep } from '../actions';

/**
 * Moves on without saving anything. Each step gains its own form, and its own "Skip for now",
 * as it is built (AUTH-04: everything but the name can be skipped).
 */
export function StepActions() {
  return (
    <form action={continueFromStep}>
      <Button type="submit" width="full" size="lg">
        Continue
      </Button>
    </form>
  );
}
