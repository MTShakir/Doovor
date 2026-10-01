import { inngest } from '../client';
import { feedbackHandled, feedbackSubmitted } from '../events';
import { sendFeedbackEmail } from '../feedback';

/**
 * "We have got your message", with the reference (D-241). A retry sends one email, because it
 * goes under a key of its own.
 */
export const feedbackReceivedEmails = inngest.createFunction(
  { id: 'feedback-received-email', name: 'Confirm a report has reached us', triggers: [feedbackSubmitted] },
  ({ event }) => sendFeedbackEmail('received', event.data.feedback_id),
);

/** "It has been dealt with", once, when a person first deals with it (D-241). */
export const feedbackHandledEmails = inngest.createFunction(
  { id: 'feedback-handled-email', name: 'Say a report has been dealt with', triggers: [feedbackHandled] },
  ({ event }) => sendFeedbackEmail('handled', event.data.feedback_id),
);
