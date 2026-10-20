import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));

const { saveFeeTerms, settleFee } = await import('./actions');

const linkId = '0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e';
const feeId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';
const manager = { businessId: 'school-1', businessType: 'school', role: 'manager' };
const weekly = { linkId, period: 'weekly', fee: '50', startsOn: '2026-11-02', freeWeeks: '1', pupilFee: '20' };
const refusal = (details: string) => ({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details } });

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [manager] } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('what a linked instructor pays the school (M9-11, D-287)', () => {
  it('saves a weekly fee, its start and free weeks, and a fee for each pupil, in pence', async () => {
    expect(await saveFeeTerms(weekly)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_school_fee_terms', {
      p_link_id: linkId,
      p_period: 'weekly',
      p_fee_pence: 5000,
      p_starts_on: '2026-11-02',
      p_free_weeks: 1,
      p_pupil_fee_pence: 2000,
    });
  });

  it('sends nothing for a regular fee when there is none', async () => {
    await saveFeeTerms({ ...weekly, period: '', fee: '50', startsOn: '2026-11-02', pupilFee: '' });
    expect(rpc).toHaveBeenCalledWith('set_school_fee_terms', {
      p_link_id: linkId,
      p_period: undefined,
      p_fee_pence: undefined,
      p_starts_on: undefined,
      p_free_weeks: 0,
      p_pupil_fee_pence: undefined,
    });
  });

  it('puts what is wrong beside its field', async () => {
    expect(await saveFeeTerms({ ...weekly, fee: '' })).toMatchObject({ ok: false, fields: { fee: 'Enter the fee' } });
    rpc.mockResolvedValueOnce(refusal('{"field": "startsOn", "reason": "in_past"}'));
    expect(await saveFeeTerms(weekly)).toMatchObject({ fields: { startsOn: 'Start today or later' } });
    rpc.mockResolvedValueOnce(refusal('{"field": "startsOn", "reason": "overlaps_last_fee", "after": "2026-11-15"}'));
    expect(await saveFeeTerms(weekly)).toMatchObject({ fields: { startsOn: 'Start after Sun 15 Nov, when the last fee already due ends' } });
  });

  it('says when the instructor is no longer linked, and is for somebody running a school', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_FOUND' } });
    expect(await saveFeeTerms(weekly)).toMatchObject({ ok: false, code: 'NOT_FOUND', message: 'This instructor is no longer linked to your school.' });
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...manager, role: 'instructor' }] } });
    rpc.mockClear();
    expect(await saveFeeTerms(weekly)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('a fee marked paid, written off or owed again (M9-13, D-287)', () => {
  it('marks a fee paid, saying how', async () => {
    expect(await settleFee({ feeId, outcome: 'paid', note: 'Bank transfer' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('settle_school_fee', { p_fee_id: feeId, p_outcome: 'paid', p_note: 'Bank transfer' });
  });

  it('writes one off, and puts it back, with no note to send', async () => {
    await settleFee({ feeId, outcome: 'written_off' });
    expect(rpc).toHaveBeenCalledWith('settle_school_fee', { p_fee_id: feeId, p_outcome: 'written_off', p_note: undefined });
    await settleFee({ feeId, outcome: 'owed' });
    expect(rpc).toHaveBeenLastCalledWith('settle_school_fee', { p_fee_id: feeId, p_outcome: 'owed', p_note: undefined });
  });

  it('refuses what is not a fee or an outcome, and passes on a refusal', async () => {
    expect(await settleFee({ feeId: 'nope', outcome: 'paid' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await settleFee({ feeId, outcome: 'refunded' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await settleFee({ feeId, outcome: 'paid' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});
