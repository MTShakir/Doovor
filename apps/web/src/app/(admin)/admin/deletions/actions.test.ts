import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { keepAccount } = await import('./actions');

const requestId = '2b7d8f1a-6c4e-4a21-9d33-5e0f7c2b8a94';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'super_admin' } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('keeping somebody who asked to leave (AUTH-09, D-175)', () => {
  it('calls the request off with the note, and reads the screen again', async () => {
    expect(await keepAccount({ requestId, note: 'Sorted it on the phone' })).toEqual({ ok: true, data: null });
    expect(requirePortal).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('admin_cancel_deletion_request', { p_request_id: requestId, p_note: 'Sorted it on the phone' });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/deletions');
  });

  it('asks for a note, since the next person reads it in the audit log', async () => {
    const result = await keepAccount({ requestId, note: '   ' });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok ? null : result.fields?.note).toBe('Say what was sorted out');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a request that is not one', async () => {
    expect(await keepAccount({ requestId: 'the last one', note: 'Sorted' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says plainly when it has already been settled, or when they may not', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'NOT_FOUND' } });
    expect(await keepAccount({ requestId, note: 'Sorted' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'That request has already been settled.',
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await keepAccount({ requestId, note: 'Sorted' })).toEqual({
      ok: false,
      code: 'NOT_ALLOWED',
      message: 'Only a super admin can call a deletion off.',
    });
  });
});
