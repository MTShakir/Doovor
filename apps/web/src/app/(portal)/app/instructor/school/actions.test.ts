import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const refuseWhileViewing = vi.fn<() => Promise<unknown>>();
const expireAll = vi.fn<() => void>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAll(); } }));

const { answerOffer, leaveSchool } = await import('./actions');

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
