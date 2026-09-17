import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { closeRegion, openRegion } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'super_admin' } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('opening and closing an area (ADM-04, M5-19)', () => {
  it('opens an area by its letters, however they were typed, and reads the regions again', async () => {
    expect(await openRegion({ area: ' ls ' })).toEqual({ ok: true, data: null });
    expect(requirePortal).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('admin_set_marketplace_region', { p_area: 'LS', p_open: true });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/regions');
  });

  it('closes one', async () => {
    expect(await closeRegion({ area: 'M' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_marketplace_region', { p_area: 'M', p_open: false });
  });

  it('says in words why the database refused, and asks it nothing for letters that are not an area', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"reason": "below_rule"}' } });
    expect(await openRegion({ area: 'LS' })).toMatchObject({ ok: false, message: 'It does not meet the switch-on rule yet.' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await closeRegion({ area: 'LS' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });

    rpc.mockClear();
    expect(await openRegion({ area: 'LS6' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
