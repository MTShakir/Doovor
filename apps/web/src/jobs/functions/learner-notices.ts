import { inngest } from '../client';
import { learnerJoined } from '../events';
import { notifyLearnerJoined } from '../learner-notices';
import { thenSend } from '../notifications-send';

/** An invitation accepted: the instructor who sent it, and their school, hear who joined (LRN-03, Appendix B, D-301). */
export const learnerJoinedNotices = inngest.createFunction(
  { id: 'learner-joined-notices', name: 'Tell an instructor a learner they invited has joined', triggers: [learnerJoined] },
  ({ event }) => notifyLearnerJoined(event.data.invitation_id).then(thenSend),
);
