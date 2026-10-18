import { inngest } from '../client';
import { badgeExpiring, instructorVerificationDecided } from '../events';
import { notifyBadgeExpiring, notifyVerificationDecided } from '../instructor-notices';
import { thenSend } from '../notifications-send';

/** A badge decided: the instructor, and their school, hear how (INS-02, Appendix B, D-260). */
export const verificationDecidedNotices = inngest.createFunction(
  { id: 'verification-decided-notices', name: 'Tell an instructor how their badge was decided', triggers: [instructorVerificationDecided] },
  ({ event }) => notifyVerificationDecided(event.data.instructor_profile_id).then(thenSend),
);

/** A badge running out: the instructor, and their school, are warned (INS-03, Appendix B, D-260). */
export const badgeExpiringNotices = inngest.createFunction(
  { id: 'badge-expiring-notices', name: 'Warn an instructor their badge is running out', triggers: [badgeExpiring] },
  ({ event }) =>
    notifyBadgeExpiring({
      instructor_profile_id: event.data.instructor_profile_id,
      days_before: event.data.days_before,
      summary: event.data.summary,
    }).then(thenSend),
);
