import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const send = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/email/provider', () => ({ emailProvider: () => ({ send }) }));
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.example.com' }));

const { tellRegionOpened } = await import('./regions');

const wendy = { email: 'Wendy@Example.com', fullName: 'Wendy Wait', token: 'token-1', kind: 'waiting_list' };
const rita = { email: 'rita@example.com', fullName: 'Rita Request', token: 'token-2', kind: 'lesson_request' };

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ ok: true, id: 'email-1' });
});

describe('telling the people waiting that their area has opened (ADM-04, D-117, M5-19)', () => {
  it('emails each address once under its own key, pointing to finding an instructor, and marks it told', async () => {
    rpc.mockResolvedValueOnce({ data: [wendy, rita], error: null }).mockResolvedValue({ data: null, error: null });

    expect(await tellRegionOpened('LS')).toEqual({ told: 2, refused: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, 'system_region_opened_recipients', { p_area: 'LS' });
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: 'Wendy@Example.com',
        subject: 'Driving instructors near LS are taking bookings',
        idempotencyKey: 'region-opened:LS:wendy@example.com',
      }),
    );
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.text).toContain('Hello Wendy');
    expect(message.text).toContain('We have taken you off the waiting list');
    expect(message.html).toContain('https://www.example.com/learners#find-an-instructor');
    expect((send.mock.calls[1]?.[0] as { text: string }).text).toContain('We keep your request until you remove it');
    expect(rpc).toHaveBeenCalledWith('system_mark_told_region_open', { p_area: 'LS', p_email: 'Wendy@Example.com' });
    expect(rpc).toHaveBeenCalledWith('system_mark_told_region_open', { p_area: 'LS', p_email: 'rita@example.com' });
  });

  it('marks an address the provider refuses, which would only be refused again', async () => {
    rpc.mockResolvedValueOnce({ data: [wendy], error: null }).mockResolvedValue({ data: null, error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'REJECTED', message: 'Bad address' });

    expect(await tellRegionOpened('LS')).toEqual({ told: 0, refused: 1 });
    expect(rpc).toHaveBeenLastCalledWith('system_mark_told_region_open', { p_area: 'LS', p_email: 'Wendy@Example.com' });
  });

  it('stops without marking when the provider cannot be reached, so a retry tells whoever is left', async () => {
    rpc.mockResolvedValueOnce({ data: [wendy, rita], error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'UNAVAILABLE', message: 'Timed out' });

    await expect(tellRegionOpened('LS')).rejects.toThrow('Could not email the people waiting in LS: Timed out');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('tells nobody when nobody is waiting, or the area has closed again', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await tellRegionOpened('LS')).toEqual({ told: 0, refused: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
