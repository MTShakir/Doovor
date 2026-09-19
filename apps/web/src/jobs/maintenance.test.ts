import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const remove = vi.fn();
const from = vi.fn(() => ({ remove }));
vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc, storage: { from } }) }));

const { pruneAuditTrail, removeUnreferencedFiles } = await import('./maintenance');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('removing pictures nothing points to any more (NFR-PRV-03, D-158)', () => {
  it("removes each bucket's pictures in one go, as the database listed them, and says how many went", async () => {
    rpc.mockResolvedValue({
      data: [
        { bucket: 'badges', name: 'p1/checked-badge.webp' },
        { bucket: 'avatars', name: 'p1/replaced-photo.webp' },
        { bucket: 'avatars', name: 'businesses/b1/replaced-logo.webp' },
      ],
      error: null,
    });
    remove.mockImplementation((names: string[]) => Promise.resolve({ data: names.map((name) => ({ name })), error: null }));

    expect(await removeUnreferencedFiles()).toEqual({ removed: 3 });
    expect(rpc).toHaveBeenCalledWith('system_unreferenced_files');
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledWith('badges');
    expect(from).toHaveBeenCalledWith('avatars');
    expect(remove).toHaveBeenCalledWith(['p1/checked-badge.webp']);
    expect(remove).toHaveBeenCalledWith(['p1/replaced-photo.webp', 'businesses/b1/replaced-logo.webp']);
  });

  it('does not touch storage when nothing is due', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    expect(await removeUnreferencedFiles()).toEqual({ removed: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it('fails, so the run is retried, when the list cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection lost' } });

    await expect(removeUnreferencedFiles()).rejects.toThrow('Could not list the pictures nothing uses: connection lost');
    expect(from).not.toHaveBeenCalled();
  });

  it('fails, so the run is retried, when storage refuses', async () => {
    rpc.mockResolvedValue({ data: [{ bucket: 'avatars', name: 'p1/replaced-photo.webp' }], error: null });
    remove.mockResolvedValue({ data: null, error: { message: 'not allowed' } });

    await expect(removeUnreferencedFiles()).rejects.toThrow('Could not remove pictures from avatars: not allowed');
  });
});

describe('pruning the audit trail (NFR-SEC-06, D-158)', () => {
  it('asks the database to prune, and says how many rows went', async () => {
    rpc.mockResolvedValue({ data: 12, error: null });

    expect(await pruneAuditTrail()).toEqual({ pruned: 12 });
    expect(rpc).toHaveBeenCalledWith('system_prune_audit_log');
  });

  it('fails, so the run is retried, when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'timeout' } });

    await expect(pruneAuditTrail()).rejects.toThrow('Could not prune the audit trail: timeout');
  });
});
