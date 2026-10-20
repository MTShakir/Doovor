import { inngest } from '../client';
import { schoolNotice } from '../events';
import { thenSend } from '../notifications-send';
import { notifySchoolNotice } from '../school-notices';

/** A change at a school: whoever it concerns hears about it (M9-28, NTF-03, D-295). */
export const schoolNotices = inngest.createFunction(
  { id: 'school-notices', name: 'Tell whoever a change at a school concerns', triggers: [schoolNotice] },
  ({ event }) => notifySchoolNotice({ kind: event.data.kind, id: event.data.id }).then(thenSend),
);
