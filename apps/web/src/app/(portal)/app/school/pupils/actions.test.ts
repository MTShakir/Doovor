import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));

const { addEnquiry, closeEnquiry, reopenEnquiry } = await import('./actions');

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
