import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const maybeSingle = vi.fn<() => Promise<unknown>>();
const createAccount = vi.fn<(learner: unknown) => Promise<unknown>>();
const removeAccount = vi.fn<(id: string) => Promise<void>>();
const enquiryAllocation = vi.fn<(id: string) => Promise<unknown>>();

const reads = { select: () => reads, eq: () => reads, maybeSingle: () => maybeSingle() };
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from: () => reads }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/learners/account', () => ({
  createUnclaimedLearnerAccount: (learner: unknown) => createAccount(learner),
  removeUnclaimedLearnerAccount: (id: string) => removeAccount(id),
}));
vi.mock('@/lib/school/allocation', () => ({ enquiryAllocation: (id: string) => enquiryAllocation(id) }));

const { addEnquiry, allocationForEnquiry, closeEnquiry, giveEnquiry, offerEnquiry, reopenEnquiry } = await import('./actions');

const enquiryId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const manager = { businessId: 'school-1', businessName: 'Quayside Driving School', businessType: 'school', role: 'manager' };
const caller = { fullName: 'Sam Caller', email: '', phone: '07700 900124', postcode: 'm1 1ae', transmission: '', note: '', agreed: true };

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [manager] } });
  rpc.mockResolvedValue({ data: 'enquiry-1', error: null });
});

describe('the office adds somebody who rang (M9-16, D-288)', () => {
  it('adds them, with the words they agreed to in the school\'s name', async () => {
    expect(await addEnquiry(caller)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('add_school_enquiry', {
      p_school_id: 'school-1',
      p_full_name: 'Sam Caller',
      p_postcode: 'M1 1AE',
      p_consent:
        'They agreed to Quayside Driving School keeping these details and passing them to one of its instructors, who will contact them about lessons.',
      p_email: undefined,
      p_phone: '+447700900124',
      p_transmission: undefined,
      p_note: undefined,
    });
  });

  it('asks for their agreement and a way to reach them, and puts a refusal beside its field', async () => {
    expect(await addEnquiry({ ...caller, agreed: false })).toMatchObject({ ok: false, fields: { agreed: 'Tick this once they have agreed' } });
    expect(await addEnquiry({ ...caller, phone: '' })).toMatchObject({ fields: { email: 'Enter an email address or a mobile number' } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "postcode"}' } });
    expect(await addEnquiry(caller)).toMatchObject({ fields: { postcode: 'Check this and try again' } });
  });

  it('is for somebody running a school', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...manager, role: 'instructor' }] } });
    expect(await addEnquiry(caller)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('closing an enquiry, and opening it again (M9-16, D-288)', () => {
  it('closes one with why, or without', async () => {
    await closeEnquiry({ enquiryId, reason: 'Booked elsewhere' });
    expect(rpc).toHaveBeenCalledWith('close_school_enquiry', { p_enquiry_id: enquiryId, p_reason: 'Booked elsewhere' });
    await closeEnquiry({ enquiryId });
    expect(rpc).toHaveBeenLastCalledWith('close_school_enquiry', { p_enquiry_id: enquiryId, p_reason: undefined });
  });

  it('says when an instructor has already taken them', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "taken"}' } });
    expect(await closeEnquiry({ enquiryId })).toMatchObject({ ok: false, message: 'An instructor has already taken this pupil.' });
  });

  it('opens one again, and refuses what is not one', async () => {
    expect(await reopenEnquiry(enquiryId)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('reopen_school_enquiry', { p_enquiry_id: enquiryId });
    expect(await reopenEnquiry('nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('offering a new pupil to linked instructors (M9-17, D-289)', () => {
  const linkId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

  it('offers them for the hours chosen', async () => {
    expect(await offerEnquiry({ enquiryId, linkIds: [linkId], hours: '48' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('offer_school_enquiry', { p_enquiry_id: enquiryId, p_link_ids: [linkId], p_hours: 48 });
  });

  it('says when a pupil is no longer waiting, or an instructor no longer linked', async () => {
    expect(await offerEnquiry({ enquiryId, linkIds: [], hours: '24' })).toMatchObject({ fields: { linkIds: 'Choose at least one instructor' } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "not_open"}' } });
    expect(await offerEnquiry({ enquiryId, linkIds: [linkId], hours: '24' })).toMatchObject({ message: 'This pupil is no longer waiting.' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "not_linked"}' } });
    expect(await offerEnquiry({ enquiryId, linkIds: [linkId], hours: '24' })).toMatchObject({ message: 'One of them is no longer linked to your school.' });
  });
});

describe("giving a new pupil to one of the school's instructors (M9-18, D-289)", () => {
  const instructorId = '2c3d4e5f-6071-4829-9a0b-1c2d3e4f5a6b';
  const waiting = { full_name: 'Pat Pupil', email: 'pat@example.com', phone: null, status: 'new' };

  beforeEach(() => {
    maybeSingle.mockResolvedValue({ data: waiting });
    createAccount.mockResolvedValue({ ok: true, userId: 'learner-1' });
  });

  it('reads who could teach them for the school', async () => {
    enquiryAllocation.mockResolvedValueOnce({ suggestions: [], everybody: [] });
    expect(await allocationForEnquiry(enquiryId)).toEqual({ ok: true, data: { suggestions: [], everybody: [] } });
    enquiryAllocation.mockRejectedValueOnce(new Error('nope'));
    expect(await allocationForEnquiry(enquiryId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it("makes the account they will claim, then the database makes them the school's learner", async () => {
    expect(await giveEnquiry({ enquiryId, instructorId })).toEqual({ ok: true, data: null });
    expect(createAccount).toHaveBeenCalledWith({ fullName: 'Pat Pupil', email: 'pat@example.com', phone: null });
    expect(rpc).toHaveBeenCalledWith('give_school_enquiry', { p_enquiry_id: enquiryId, p_instructor_id: instructorId, p_learner_id: 'learner-1' });
  });

  it('makes no account for a pupil no longer waiting, and takes one back when the database says no', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { ...waiting, status: 'taken' } });
    expect(await giveEnquiry({ enquiryId, instructorId })).toMatchObject({ message: 'This pupil is no longer waiting.' });
    expect(createAccount).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "instructor"}' } });
    expect(await giveEnquiry({ enquiryId, instructorId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(removeAccount).toHaveBeenCalledWith('learner-1');
  });

  it('says when their details already belong to an account', async () => {
    createAccount.mockResolvedValueOnce({ ok: false, taken: true });
    expect(await giveEnquiry({ enquiryId, instructorId })).toMatchObject({ ok: false, code: 'DUPLICATE_CONTACT' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
