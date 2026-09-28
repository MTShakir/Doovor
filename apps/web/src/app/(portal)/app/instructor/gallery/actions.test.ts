import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAccess = vi.fn<() => Promise<unknown>>();
const refuseWhileViewing = vi.fn<() => Promise<unknown>>();
const rpc = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const removeProfileImage = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc: (...args: unknown[]) => rpc(...args) }),
}));
vi.mock('@/lib/auth/session', () => ({ requireAccess: () => requireAccess() }));
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => refuseWhileViewing() }));
vi.mock('@/lib/storage/images', () => ({
  galleryBucket: 'gallery',
  removeProfileImage: (...args: unknown[]) => removeProfileImage(...args),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { addGalleryPhoto, removeGalleryPhoto } = await import('./actions');

const business = 'b0a1c2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const photoId = 'c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5e';
const learnerId = 'd2a3b4c5-6e7f-4a8b-9c0d-1e2f3a4b5c6d';
const good = { imagePath: `${business}/passed.webp`, passedOn: '2026-01-05', learnerName: 'Jaz Hall', consent: true };

beforeEach(() => {
  vi.clearAllMocks();
  requireAccess.mockResolvedValue(undefined);
  refuseWhileViewing.mockResolvedValue(null);
  rpc.mockResolvedValue({ data: photoId, error: null });
});

describe('adding a pass photo (D-218)', () => {
  it('sends the path, the day and the typed name', async () => {
    const result = await addGalleryPhoto(good);
    expect(result).toEqual({ ok: true, data: { photoId } });
    expect(rpc).toHaveBeenCalledWith('add_gallery_photo', {
      p_image_path: `${business}/passed.webp`,
      p_passed_on: '2026-01-05',
      p_learner_name: 'Jaz Hall',
    });
  });

  it('sends a learner from the list instead of a name, and leaves the name out', async () => {
    await addGalleryPhoto({ ...good, learnerName: '', learnerId });
    expect(rpc).toHaveBeenCalledWith('add_gallery_photo', {
      p_image_path: `${business}/passed.webp`,
      p_passed_on: '2026-01-05',
      p_learner_id: learnerId,
    });
  });

  it('will not send anything without the tick, which is the whole of the consent', async () => {
    const result = await addGalleryPhoto({ ...good, consent: false });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok ? null : result.fields?.consent).toBe('Confirm you have their permission to show this');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says whose plan it is when the database refuses it', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PLAN_REQUIRED' } });
    const result = await addGalleryPhoto(good);
    expect(result).toMatchObject({ ok: false, code: 'PLAN_REQUIRED', message: 'The gallery is part of Pro.' });
  });

  it('refuses while somebody is looking at the app as another person (ADM-06)', async () => {
    refuseWhileViewing.mockResolvedValue({ ok: false, code: 'NOT_ALLOWED', message: 'Not while viewing as somebody else.' });
    const result = await addGalleryPhoto(good);
    expect(result).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('taking a pass photo down (D-218)', () => {
  it('removes the row, and the picture the row named', async () => {
    rpc.mockResolvedValue({ data: `${business}/passed.webp`, error: null });
    const result = await removeGalleryPhoto({ photoId });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('remove_gallery_photo', { p_photo_id: photoId });
    expect(removeProfileImage).toHaveBeenCalledWith(expect.anything(), 'gallery', `${business}/passed.webp`);
  });

  it('leaves the picture alone when the database would not remove the row', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_ALLOWED' } });
    const result = await removeGalleryPhoto({ photoId });
    expect(result).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(removeProfileImage).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a photo', async () => {
    const result = await removeGalleryPhoto({ photoId: 'not a photo' });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
