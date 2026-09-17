import { sendCaptureConfirmation } from '../capture';
import { inngest } from '../client';
import { learnerCaptureCreated } from '../events';

/**
 * A place on an area's waiting list, or a lesson request, is confirmed by email with the button
 * that removes it (MKT-10, D-117). A retry sends one email, because it goes under a key of its own.
 */
export const learnerCaptureConfirmations = inngest.createFunction(
  { id: 'learner-capture-confirmation', name: 'Confirm a waiting list place or lesson request', triggers: [learnerCaptureCreated] },
  ({ event }) => sendCaptureConfirmation(event.data.kind, event.data.id),
);
