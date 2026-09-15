import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => Promise.resolve({ session: { userId: 'learner-1' } }) }));
vi.mock('@/lib/booking/public', () => ({ openSlots: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { disputeNoShow } = await import('./actions');

const bookingId = '7a1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('disputing a no-show (R-09, M3-19)', () => {
  it('sends what happened to the function that checks it is theirs and still open', async () => {
    rpc.mockResolvedValue({ data: 'dispute-1', error: null });

    expect(await disputeNoShow({ bookingId, reason: '  I was waiting at the corner  ' })).toEqual({ ok: true, data: { disputeId: 'dispute-1' } });
    expect(rpc).toHaveBeenCalledWith('dispute_no_show', { p_booking_id: bookingId, p_reason: 'I was waiting at the corner' });
    expect(revalidatePath).toHaveBeenCalledWith('/app/learner/lessons');
  });

  it('asks nothing of the database without a reason or a lesson', async () => {
    expect(await disputeNoShow({ bookingId, reason: '   ' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED', message: 'Say what happened.' });
    expect(await disputeNoShow({ bookingId: 'nope', reason: 'Wrong' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await disputeNoShow({ bookingId, reason: 'x'.repeat(1001) })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused: somebody else, too late, or twice', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await disputeNoShow({ bookingId, reason: 'Not mine' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "dispute_until"}' } });
    expect(await disputeNoShow({ bookingId, reason: 'Too late' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
