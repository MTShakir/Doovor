import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearnerAllocation } from '@/lib/school/allocation';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const learnerAllocation = vi.fn<(businessId: string, learnerId: string) => Promise<LearnerAllocation>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/school/allocation', () => ({ learnerAllocation: (businessId: string, learnerId: string) => learnerAllocation(businessId, learnerId) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { assignLearner, suggestInstructors } = await import('./actions');

const school = { businessId: 'school-1', businessName: 'Quayside Driving School', businessType: 'school', role: 'owner' };
const learnerId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';
const instructorId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [school] } });
});

describe('suggesting who teaches a learner (SCH-03, M5-14)', () => {
  it('asks for the school the person runs', async () => {
    const allocation: LearnerAllocation = { suggestions: [], everybody: [{ id: instructorId, name: 'Emma Clarke' }] };
    learnerAllocation.mockResolvedValueOnce(allocation);
    expect(await suggestInstructors(learnerId)).toEqual({ ok: true, data: allocation });
    expect(learnerAllocation).toHaveBeenCalledWith('school-1', learnerId);
  });

  it('answers with words rather than throwing, and needs a real learner and somebody running a school', async () => {
    learnerAllocation.mockRejectedValueOnce(new Error('Could not read who could teach this learner: boom'));
    expect(await suggestInstructors(learnerId)).toEqual({
      ok: false,
      code: 'UNKNOWN',
      message: 'We could not work out who suits them best just now.',
    });
    expect(await suggestInstructors('not-an-id')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    requirePortal.mockResolvedValueOnce({ access: { memberships: [{ ...school, role: 'instructor' }] } });
    expect(await suggestInstructors(learnerId)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});

describe('giving a learner to an instructor (LRN-06)', () => {
  it('passes on a refusal to give them to somebody switched off (D-120)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'INSTRUCTOR_INACTIVE' } });
    expect(await assignLearner({ learnerId, instructorId })).toMatchObject({
      ok: false,
      code: 'INSTRUCTOR_INACTIVE',
      message: 'This instructor is not taking lessons here any more.',
    });
    rpc.mockResolvedValueOnce({ data: 'link-1', error: null });
    expect(await assignLearner({ learnerId, instructorId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('assign_learner', { p_learner_id: learnerId, p_instructor_id: instructorId });
  });
});
