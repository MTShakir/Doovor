import type { LearnerStatus } from '@repo/core/learners';
import type { PillStatus } from '@repo/ui/status-pill';

/** Learner statuses in the colours PRD 7.4 already gives those meanings (LRN-05). */
const pills: Record<LearnerStatus, PillStatus> = {
  enquiry: 'pending',
  waiting: 'pending',
  active: 'confirmed',
  test_booked: 'test-day',
  passed: 'completed',
  left: 'pending',
};

export function statusPill(status: LearnerStatus): PillStatus {
  return pills[status];
}
