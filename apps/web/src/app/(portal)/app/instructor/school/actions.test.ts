import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const refuseWhileViewing = vi.fn<() => Promise<unknown>>();
const expireAll = vi.fn<() => void>();
const ownSchoolLink = vi.fn<() => Promise<unknown>>();
const pupilOffersFor = vi.fn<(businessId: string) => Promise<unknown>>();
const createAccount = vi.fn<(learner: unknown) => Promise<unknown>>();
const removeAccount = vi.fn<(id: string) => Promise<void>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/lib/school/link', () => ({ ownSchoolLink: () => ownSchoolLink() }));
vi.mock('@/lib/school/pupil-offers', () => ({ pupilOffersFor: (businessId: string) => pupilOffersFor(businessId) }));
vi.mock('@/lib/learners/account', () => ({
  createUnclaimedLearnerAccount: (learner: unknown) => createAccount(learner),
  removeUnclaimedLearnerAccount: (id: string) => removeAccount(id),
}));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAll(); } }));

const { addEnquiryLearner, answerOffer, leaveSchool } = await import('./actions');

const offerId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const refusal = (reason: string) => ({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: `{"reason": "${reason}"}` } });

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [] } });
  refuseWhileViewing.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('a linked instructor answering an offer of a pupil (M9-17, D-289)', () => {
  it('accepts, or declines, through the database', async () => {
    expect(await answerOffer({ offerId, accept: true })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('answer_enquiry_offer', { p_offer_id: offerId, p_accept: true });
    await answerOffer({ offerId, accept: false });
    expect(rpc).toHaveBeenLastCalledWith('answer_enquiry_offer', { p_offer_id: offerId, p_accept: false });
  });

  it('says why an offer can no longer be answered', async () => {
    const said: [string, string][] = [
      ['taken', 'Another instructor said yes first.'],
      ['lapsed', 'This offer ran out.'],
      ['withdrawn', 'The school took this offer back.'],
      ['not_linked', 'You are no longer linked to this school.'],
      ['answered', 'You have already answered this one.'],
    ];
    for (const [reason, words] of said) {
      rpc.mockResolvedValueOnce(refusal(reason));
      expect(await answerOffer({ offerId, accept: true })).toMatchObject({ ok: false, message: words });
    }
  });

  it('refuses what is not an offer, and somebody only looking', async () => {
    expect(await answerOffer({ offerId: 'nope', accept: true })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    refuseWhileViewing.mockResolvedValueOnce({ ok: false, code: 'NOT_ALLOWED', message: 'You are viewing as somebody else.' });
    expect(await answerOffer({ offerId, accept: true })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('leaving the school (D-282)', () => {
  it('ends the link, and the public pages are read fresh', async () => {
    expect(await leaveSchool(offerId)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('end_school_link', { p_link_id: offerId });
    expect(expireAll).toHaveBeenCalled();
  });

  it('refuses what is not a link, and passes on a refusal', async () => {
    expect(await leaveSchool('nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await leaveSchool(offerId)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(expireAll).not.toHaveBeenCalled();
  });
});

describe("putting a pupil the school introduced on the instructor's own list (M9-19, D-290)", () => {
  const enquiryId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
  const accepted = {
    enquiryId,
    status: 'accepted',
    learnerAdded: false,
    contact: { fullName: 'Pat Pupil', email: 'pat@example.com', phone: '07700 900123', phoneE164: '+447700900123', postcode: 'M1 1AE' },
  };

  beforeEach(() => {
    ownSchoolLink.mockResolvedValue({ businessId: 'biz-1' });
    pupilOffersFor.mockResolvedValue([accepted]);
    createAccount.mockResolvedValue({ ok: true, userId: 'learner-1' });
  });

  it('makes the account they will claim, from the details the instructor was given, and links it', async () => {
    expect(await addEnquiryLearner(enquiryId)).toEqual({ ok: true, data: null });
    expect(pupilOffersFor).toHaveBeenCalledWith('biz-1');
    expect(createAccount).toHaveBeenCalledWith({ fullName: 'Pat Pupil', email: 'pat@example.com', phone: '+447700900123' });
    expect(rpc).toHaveBeenCalledWith('add_enquiry_learner', { p_enquiry_id: enquiryId, p_learner_id: 'learner-1' });
  });

  it('makes no account for a pupil the Business did not take, or one already on the list', async () => {
    pupilOffersFor.mockResolvedValueOnce([]);
    expect(await addEnquiryLearner(enquiryId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    pupilOffersFor.mockResolvedValueOnce([{ ...accepted, learnerAdded: true }]);
    expect(await addEnquiryLearner(enquiryId)).toMatchObject({ ok: false, message: 'They are on your list already.' });
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('takes the account back when the database says no, and says when the details belong to an account', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_FOUND' } });
    expect(await addEnquiryLearner(enquiryId)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(removeAccount).toHaveBeenCalledWith('learner-1');
    createAccount.mockResolvedValueOnce({ ok: false, taken: true });
    expect(await addEnquiryLearner(enquiryId)).toMatchObject({ ok: false, code: 'DUPLICATE_CONTACT' });
  });
});
