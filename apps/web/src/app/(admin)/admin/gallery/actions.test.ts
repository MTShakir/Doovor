import { beforeEach, describe, expect, it, vi } from 'vitest';

const requirePortal = vi.fn<() => Promise<unknown>>();
const rpc = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc: (...args: unknown[]) => rpc(...args) }),
}));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { checkGalleryPhoto, hideGalleryPhoto } = await import('./actions');

const photoId = 'c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5e';

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('checking a pass photo (D-218)', () => {
  it('ticks one, and takes the tick back', async () => {
    expect(await checkGalleryPhoto({ photoId, verified: true })).toEqual({ ok: true, data: { verified: true } });
    expect(rpc).toHaveBeenLastCalledWith('admin_check_gallery_photo', { p_photo_id: photoId, p_verified: true });

    await checkGalleryPhoto({ photoId, verified: false });
    expect(rpc).toHaveBeenLastCalledWith('admin_check_gallery_photo', { p_photo_id: photoId, p_verified: false });
  });

  it('takes one down, and puts it back', async () => {
    expect(await hideGalleryPhoto({ photoId, hidden: true })).toEqual({ ok: true, data: { hidden: true } });
    expect(rpc).toHaveBeenLastCalledWith('admin_hide_gallery_photo', { p_photo_id: photoId, p_hidden: true });

    await hideGalleryPhoto({ photoId, hidden: false });
    expect(rpc).toHaveBeenLastCalledWith('admin_hide_gallery_photo', { p_photo_id: photoId, p_hidden: false });
  });

  it('says who may, when the database says they may not', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_ALLOWED' } });
    expect(await checkGalleryPhoto({ photoId, verified: true })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
      message: 'Only platform staff can do that.',
    });
  });

  it('says so when the photo has gone', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_FOUND' } });
    expect(await hideGalleryPhoto({ photoId, hidden: true })).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      message: 'That photo is no longer there.',
    });
  });

  it('refuses anything that is not a photo and an answer', async () => {
    expect(await checkGalleryPhoto({ photoId: 'not a photo', verified: true })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await hideGalleryPhoto({ photoId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
