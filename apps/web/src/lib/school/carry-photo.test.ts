import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/storage/images', () => ({ avatarsBucket: 'avatars' }));

const { carryPhotoOver } = await import('./carry-photo');

interface Profile {
  id: string;
  business_id: string;
  photo_path: string | null;
}

const copy = vi.fn<(from: string, to: string) => Promise<{ error: { message: string } | null }>>();
const updated = vi.fn<(patch: unknown, id: string) => void>();

/** Just enough of the client: the profiles read, the copy, and the one update. */
function client(profiles: Profile[]) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: profiles, error: null }) }) }),
      update: (patch: unknown) => ({
        eq: (_column: string, id: string) => {
          updated(patch, id);
          return Promise.resolve({ error: null });
        },
      }),
    }),
    storage: { from: () => ({ copy }) },
  } as unknown as Parameters<typeof carryPhotoOver>[0];
}

const own: Profile = { id: 'own-1', business_id: 'biz-1', photo_path: 'own-1/a1b2c3d4-e5f6.webp' };
const made: Profile = { id: 'made-1', business_id: 'school-1', photo_path: null };

beforeEach(() => {
  vi.clearAllMocks();
  copy.mockResolvedValue({ error: null });
});

describe('the photo an instructor joining a school brings with them (D-324)', () => {
  it('is copied into the new profile, as a picture of its own', async () => {
    await carryPhotoOver(client([made, own]), 'user-1', 'school-1');

    expect(copy).toHaveBeenCalledWith('own-1/a1b2c3d4-e5f6.webp', expect.stringMatching(/^made-1\/[0-9a-f-]+\.webp$/));
    const [to] = copy.mock.calls[0]?.slice(1) ?? [];
    expect(updated).toHaveBeenCalledWith({ photo_path: to }, 'made-1');
  });

  it('leaves alone a profile that has a photo already, or one with nothing to bring', async () => {
    await carryPhotoOver(client([{ ...made, photo_path: 'made-1/kept-photo.webp' }, own]), 'user-1', 'school-1');
    await carryPhotoOver(client([made, { ...own, photo_path: null }]), 'user-1', 'school-1');

    expect(copy).not.toHaveBeenCalled();
    expect(updated).not.toHaveBeenCalled();
  });

  it('saves nothing when the copy did not work, since a photo can be added later', async () => {
    copy.mockResolvedValueOnce({ error: { message: 'Object not found' } });
    await carryPhotoOver(client([made, own]), 'user-1', 'school-1');

    expect(updated).not.toHaveBeenCalled();
  });
});
