import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const send = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/email/provider', () => ({ emailProvider: () => ({ send }) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));

const { sendFeedbackEmail } = await import('./feedback');

const aReport = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  reference: 'R07',
  kind: 'issue',
  message: 'The diary will not scroll on my phone',
  handled: false,
  name: 'Asha Patel',
  email: 'asha@example.com',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: aReport(), error: null });
  send.mockResolvedValue({ ok: true, id: 'em_1' });
});

describe('telling somebody about their report (D-241)', () => {
  it('writes to them with the reference in the subject and in the words', async () => {
    expect(await sendFeedbackEmail('received', 'f1')).toEqual({ sent: true });

    const message = send.mock.calls[0]?.[0] as { to: string; subject: string; text: string };
    expect(message.to).toBe('asha@example.com');
    expect(message.subject).toContain('R07');
    expect(message.text).toContain('R07');
    // And what they actually said, so the email is about something rather than about nothing.
    expect(message.text).toContain('The diary will not scroll on my phone');
  });

  it('says a different thing when it has been dealt with', async () => {
    await sendFeedbackEmail('handled', 'f1');

    const message = send.mock.calls[0]?.[0] as { subject: string; text: string };
    expect(message.subject).toContain('dealt with');
    expect(message.text).toContain('R07');
  });

  it('sends each kind under a key of its own, so a retry writes once', async () => {
    await sendFeedbackEmail('received', 'f1');
    await sendFeedbackEmail('handled', 'f1');

    expect(send.mock.calls[0]?.[0]).toMatchObject({ idempotencyKey: 'feedback-received:f1' });
    expect(send.mock.calls[1]?.[0]).toMatchObject({ idempotencyKey: 'feedback-handled:f1' });
  });

  it('greets them by their first name, and manages without one', async () => {
    await sendFeedbackEmail('received', 'f1');
    expect((send.mock.calls[0]?.[0] as { text: string }).text).toContain('Hello Asha');

    vi.clearAllMocks();
    send.mockResolvedValue({ ok: true, id: 'em_2' });
    rpc.mockResolvedValue({ data: aReport({ name: null }), error: null });
    expect(await sendFeedbackEmail('received', 'f1')).toEqual({ sent: true });
  });

  it('shortens a very long message rather than posting a wall of it', async () => {
    rpc.mockResolvedValue({ data: aReport({ message: 'x'.repeat(400) }), error: null });

    await sendFeedbackEmail('received', 'f1');

    const text = (send.mock.calls[0]?.[0] as { text: string }).text;
    expect(text).toContain('...');
    expect(text).not.toContain('x'.repeat(200));
  });

  it('writes to nobody when the report has gone, or has no address', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await sendFeedbackEmail('received', 'gone')).toEqual({ sent: false, reason: 'gone' });

    for (const email of [null, '   ']) {
      rpc.mockResolvedValue({ data: aReport({ email }), error: null });
      expect(await sendFeedbackEmail('received', 'f1')).toEqual({ sent: false, reason: 'no_address' });
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('counts an address the provider refuses as done, because it will refuse it again', async () => {
    send.mockResolvedValue({ ok: false, reason: 'REJECTED', message: 'no such mailbox' });

    expect(await sendFeedbackEmail('received', 'f1')).toEqual({ sent: false, reason: 'refused' });
  });

  it('throws when the provider cannot be reached, so the runner tries again', async () => {
    send.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'timeout' });

    await expect(sendFeedbackEmail('received', 'f1')).rejects.toThrow('Could not email the confirmation');
  });

  it('throws rather than guessing when the report cannot be read', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });

    await expect(sendFeedbackEmail('received', 'f1')).rejects.toThrow('Could not read the report');
  });

  it('treats a kind it has not been taught as something else, rather than failing', async () => {
    rpc.mockResolvedValue({ data: aReport({ kind: 'invented' }), error: null });

    expect(await sendFeedbackEmail('received', 'f1')).toEqual({ sent: true });
    expect((send.mock.calls[0]?.[0] as { text: string }).text).toContain('what you told us');
  });
});
