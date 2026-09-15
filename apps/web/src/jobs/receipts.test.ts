import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const send = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/email/provider', () => ({ emailProvider: () => ({ send }) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.com' }));

const { sendReceipt } = await import('./receipts');

const issued = (overrides: Record<string, unknown> = {}) => ({
  id: 'receipt-1',
  payment_id: 'payment-1',
  number: 7,
  issued_at: '2026-09-14T11:30:00Z',
  business_name: 'Quayside Driving School',
  business_address: { line1: '4 Quay Street', town: 'Manchester', postcode: 'M1 2QF' },
  vat_number: null,
  vat_rate_percent: null,
  vat_pence: null,
  amount_pence: 4200,
  method: 'card',
  kind: 'lesson',
  lesson_starts_at: '2026-09-15T09:00:00Z',
  lesson_minutes: 60,
  lesson_type: 'Standard lesson',
  instructor_name: 'Emma Clarke',
  credit_minutes: null,
  emailed_at: null,
  learner_email: 'polly@example.com',
  learner_name: 'Polly Payne',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  send.mockResolvedValue({ ok: true, id: 'email-1' });
});

describe('sending a receipt (PAY-08, M3-20)', () => {
  it('issues it, emails it to the learner once under its own key, and records that it went', async () => {
    rpc.mockResolvedValueOnce({ data: issued(), error: null });
    rpc.mockResolvedValueOnce({ data: true, error: null });

    expect(await sendReceipt('payment-1')).toEqual({ sent: true, receiptId: 'receipt-1' });
    expect(rpc).toHaveBeenNthCalledWith(1, 'system_issue_receipt', { p_payment_id: 'payment-1' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'polly@example.com',
        subject: 'Receipt 7 from Quayside Driving School',
        idempotencyKey: 'receipt:receipt-1',
      }),
    );
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.text).toContain('Hello Polly');
    expect(message.html).toContain('https://app.example.com/receipts/payment-1');
    expect(rpc).toHaveBeenNthCalledWith(2, 'system_mark_receipt_emailed', { p_receipt_id: 'receipt-1' });
  });

  it('waits for cash that can still be taken back out, and sends nothing for no receipt or one already sent', async () => {
    rpc.mockResolvedValueOnce({ data: { wait_until: '2026-09-14T11:40:00Z' }, error: null });
    expect(await sendReceipt('payment-1')).toEqual({ sent: false, waitUntil: '2026-09-14T11:40:00Z' });

    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await sendReceipt('payment-1')).toEqual({ sent: false, reason: 'no_receipt' });

    rpc.mockResolvedValueOnce({ data: issued({ emailed_at: '2026-09-14T11:31:00Z' }), error: null });
    expect(await sendReceipt('payment-1')).toEqual({ sent: false, reason: 'already_sent', receiptId: 'receipt-1' });

    rpc.mockResolvedValueOnce({ data: issued({ learner_email: null }), error: null });
    expect(await sendReceipt('payment-1')).toEqual({ sent: false, reason: 'no_email', receiptId: 'receipt-1' });

    expect(send).not.toHaveBeenCalled();
  });

  it('stops trying an address that is refused, and tries again when the provider is down', async () => {
    rpc.mockResolvedValueOnce({ data: issued(), error: null });
    rpc.mockResolvedValueOnce({ data: true, error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'REJECTED', message: 'Bad address.' });
    expect(await sendReceipt('payment-1')).toEqual({ sent: false, reason: 'refused', receiptId: 'receipt-1' });
    expect(rpc).toHaveBeenLastCalledWith('system_mark_receipt_emailed', { p_receipt_id: 'receipt-1' });

    rpc.mockClear();
    rpc.mockResolvedValueOnce({ data: issued(), error: null });
    send.mockResolvedValueOnce({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });
    await expect(sendReceipt('payment-1')).rejects.toThrow('Could not email the receipt');
    expect(rpc).not.toHaveBeenCalledWith('system_mark_receipt_emailed', expect.anything());
  });

  it('fails loudly when it cannot issue the receipt', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'connection refused' } });
    await expect(sendReceipt('payment-1')).rejects.toThrow('Could not issue the receipt');
  });
});
