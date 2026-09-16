import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const send = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/email/provider', () => ({ emailProvider: () => ({ send }) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.com' }));

const { isCaptureKind, sendCaptureConfirmation } = await import('./capture');

const entry = (overrides: Record<string, unknown> = {}) => ({
  email: 'lily@example.com',
  fullName: 'Lily Learner',
  postcodeArea: 'LS',
  token: '5b0f2c4e-3a51-4c0a-9d7e-1f2a3b4c5d6e',
  sent: false,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ ok: true, id: 'email-1' });
});

describe('confirming a waiting list place or lesson request (MKT-10, M5-10)', () => {
  it('emails it once under its own key, with the button that removes the details, and records that it went', async () => {
    rpc.mockResolvedValueOnce({ data: entry(), error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });

    expect(await sendCaptureConfirmation('waiting_list', 'entry-1')).toEqual({ sent: true });
    expect(rpc).toHaveBeenNthCalledWith(1, 'system_learner_capture_confirmation', { p_kind: 'waiting_list', p_id: 'entry-1' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'lily@example.com', subject: 'You are on the waiting list for LS', idempotencyKey: 'learner-capture:entry-1' }),
    );
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.text).toContain('Hello Lily');
    expect(message.text).toContain('Remove my details');
    expect(message.html).toContain('https://app.example.com/your-details/5b0f2c4e-3a51-4c0a-9d7e-1f2a3b4c5d6e');
    expect(rpc).toHaveBeenNthCalledWith(2, 'system_mark_learner_capture_confirmed', { p_kind: 'waiting_list', p_id: 'entry-1' });
  });

  it('sends nothing for something already removed or already confirmed', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await sendCaptureConfirmation('lesson_request', 'entry-2')).toEqual({ sent: false, reason: 'gone' });
    rpc.mockResolvedValueOnce({ data: entry({ sent: true }), error: null });
    expect(await sendCaptureConfirmation('lesson_request', 'entry-2')).toEqual({ sent: false, reason: 'already_sent' });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops trying an address that is refused, and tries again when the provider is down', async () => {
    rpc.mockResolvedValueOnce({ data: entry(), error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'REJECTED', message: 'Bad address.' });
    expect(await sendCaptureConfirmation('lesson_request', 'entry-3')).toEqual({ sent: false, reason: 'refused' });
    expect(rpc).toHaveBeenLastCalledWith('system_mark_learner_capture_confirmed', { p_kind: 'lesson_request', p_id: 'entry-3' });

    rpc.mockResolvedValueOnce({ data: entry(), error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'UNAVAILABLE', message: 'Try later.' });
    await expect(sendCaptureConfirmation('lesson_request', 'entry-4')).rejects.toThrow('Could not email the confirmation');
  });

  it('knows the two kinds and nothing else', () => {
    expect(isCaptureKind('waiting_list')).toBe(true);
    expect(isCaptureKind('lesson_request')).toBe(true);
    expect(isCaptureKind('booking')).toBe(false);
  });
});
