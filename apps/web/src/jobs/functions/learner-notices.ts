import { inngest } from '../client';
import { learnerJoined } from '../events';
import { notifyLearnerJoined } from '../learner-notices';
import { thenSend } from '../notifications-send';

/** A learner accepted an invitation: whoever invited them, and their school, hear (NTF-03, D-297). */
export const learnerJoinedNotices = inngest.createFunction(
  { id: 'learner-joined-notices', name: 'Tell an instructor a learner joined them', triggers: [learnerJoined] },
  ({ event }) => notifyLearnerJoined(event.data.invitation_id).then(thenSend),
);
