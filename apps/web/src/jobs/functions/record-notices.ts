import { inngest } from '../client';
import { lessonRecordAdded } from '../events';
import { notifyLessonRecordAdded } from '../record-notices';

/** The learner hears their lesson record is ready, in the inbox and on their phone (NTF-03, PRD 10.2 step 4, M4-12). */
export const lessonRecordNotices = inngest.createFunction(
  { id: 'lesson-record-notices', name: 'Tell a learner their lesson record is ready', triggers: [lessonRecordAdded] },
  ({ event }) => notifyLessonRecordAdded(event.data.lesson_record_id),
);
