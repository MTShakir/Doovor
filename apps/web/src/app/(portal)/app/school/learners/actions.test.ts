import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearnerAllocation } from '@/lib/school/allocation';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const learnerAllocation = vi.fn<(businessId: string, learnerId: string) => Promise<LearnerAllocation>>();
const createAccount = vi.fn<(learner: unknown) => Promise<unknown>>();
const removeAccount = vi.fn<(id: string) => Promise<void>>();
const maybeSingle = vi.fn<() => Promise<unknown>>();

// The list is read for somebody already on it with the same details.
const list = { select: () => list, eq: () => list, limit: () => list, maybeSingle: () => maybeSingle() };
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from: () => list }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/school/allocation', () => ({ learnerAllocation: (businessId: string, learnerId: string) => learnerAllocation(businessId, learnerId) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/learners/account', () => ({
  createUnclaimedLearnerAccount: (learner: unknown) => createAccount(learner),
  removeUnclaimedLearnerAccount: (id: string) => removeAccount(id),
}));

const { addSchoolLearner, assignLearner, importSchoolLearners, suggestInstructors } = await import('./actions');

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

describe('a school adds its own learners (M9-27, D-294)', () => {
  const nell = { fullName: 'Nell New', phone: '07700 900144', email: '', postcode: 'm1 1ae', transmission: 'automatic', instructorId };

  beforeEach(() => {
    maybeSingle.mockResolvedValue({ data: null });
    createAccount.mockResolvedValue({ ok: true, userId: 'learner-1' });
    rpc.mockResolvedValue({ data: 'relationship-1', error: null });
  });

  it('makes the account they will claim, and links it to the school with the instructor chosen', async () => {
    requirePortal.mockResolvedValueOnce({ access: { memberships: [{ ...school, role: 'manager' }] } });
    expect(await addSchoolLearner(nell)).toEqual({ ok: true, data: { learnerId: 'learner-1' } });
    expect(createAccount).toHaveBeenCalledWith({ fullName: 'Nell New', email: null, phone: '+447700900144' });
    expect(rpc).toHaveBeenCalledWith('add_school_learner', {
      p_school_id: 'school-1',
      p_learner_id: 'learner-1',
      p_instructor_id: instructorId,
      p_postcode: 'M1 1AE',
      p_transmission: 'automatic',
      p_source: 'manual',
    });
  });

  it("leaves who teaches them for later, and needs one of the school's instructors if anybody", async () => {
    await addSchoolLearner({ ...nell, instructorId: '' });
    expect(rpc).toHaveBeenCalledWith('add_school_learner', expect.objectContaining({ p_instructor_id: undefined }));
    expect(await addSchoolLearner({ ...nell, instructorId: 'somebody' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('says when they are on the list already, and takes the account back when the database says no', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { full_name: 'Nell New' } });
    expect(await addSchoolLearner(nell)).toMatchObject({ ok: false, code: 'DUPLICATE_CONTACT', message: 'Nell New is already on your list with those details.' });
    expect(createAccount).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "instructor"}' } });
    expect(await addSchoolLearner(nell)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(removeAccount).toHaveBeenCalledWith('learner-1');
  });

  it('is for somebody running a school', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...school, role: 'instructor' }] } });
    expect(await addSchoolLearner(nell)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await importSchoolLearners({ rows: [{ line: 2, fullName: 'Ned New', phone: '07700 900145' }] })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('imports a spreadsheet, each with nobody yet, and says which rows it could not', async () => {
    expect(
      await importSchoolLearners({
        rows: [
          { line: 2, fullName: 'Ned New', phone: '07700 900145' },
          { line: 3, fullName: '', phone: '' },
        ],
      }),
    ).toMatchObject({ ok: true, data: { imported: 1, problems: [{ line: 3 }] } });
    expect(rpc).toHaveBeenCalledWith('add_school_learner', expect.objectContaining({ p_instructor_id: undefined, p_source: 'import' }));
  });
});
