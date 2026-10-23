import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const sendEmail = vi.fn();
const sendText = vi.fn();
const render = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/email/provider', () => ({ emailProvider: () => ({ send: sendEmail }) }));
vi.mock('@/lib/sms/provider', () => ({ smsProvider: () => ({ send: sendText }) }));
vi.mock('@/lib/notifications/push', () => ({ pushConfigured: () => false, sendPush: vi.fn() }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.com' }));
vi.mock('@repo/emails', () => ({ renderNotificationEmail: render }));

const { sendPendingNotifications } = await import('./notifications-send');

const claimed = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_id: `user-${id}`,
  email: `${id}@example.com`,
  phone: '',
  full_name: 'Ivy Fresh',
  business_id: 'business-1',
  business_plan: 'free',
  kind: 'booking.cancelled',
  category: 'bookings',
  title: 'Lesson cancelled',
  body: 'Mon 26 Oct at 15:00 with Dan Byhand.',
  link: '/app/instructor/diary?view=day&date=2026-10-26',
  channels: ['in_app', 'email'],
  dedupe_key: `booking.cancelled:${id}`,
  ...overrides,
});

/** The database as the sender sees it: the batch it claims, and whatever it is told after. */
function database(batch: ReturnType<typeof claimed>[]) {
  rpc.mockImplementation((name: string) => {
    if (name === 'system_claim_notifications') return Promise.resolve({ data: batch, error: null });
    if (name === 'system_plan_limits') return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: null, error: null });
  });
}

function told(name: string): unknown[] {
  return rpc.mock.calls.filter(([called]) => called === name).map(([, args]) => args as unknown);
}

beforeEach(() => {
  vi.clearAllMocks();
  render.mockResolvedValue({ subject: 'Lesson cancelled', html: '<p>Lesson cancelled</p>', text: 'Lesson cancelled' });
  sendEmail.mockResolvedValue({ ok: true, id: 'email-1' });
  sendText.mockResolvedValue({ ok: true, id: 'text-1' });
});

describe('sending what is waiting (NTF-01, NTF-03, D-373)', () => {
  it('sends to somebody with no email address only what needs none, and carries on', async () => {
    // A learner added by hand with only a mobile number has no address (D-068).
    database([claimed('first'), claimed('dan', { email: '' }), claimed('last')]);

    expect(await sendPendingNotifications()).toEqual({ sent: 3, failed: 0 });
    expect(sendEmail.mock.calls.map(([message]) => (message as { to: string }).to)).toEqual([
      'first@example.com',
      'last@example.com',
    ]);
    expect(told('system_mark_notifications_sent')).toEqual([{ p_ids: ['first', 'dan', 'last'] }]);
  });

  it('keeps one notification that cannot be sent to itself: the rest go, and are marked sent', async () => {
    render.mockImplementation((props: { body: string }) =>
      props.body === 'broken'
        ? Promise.reject(new Error('Could not render the email.'))
        : Promise.resolve({ subject: 'Lesson cancelled', html: '<p>Lesson cancelled</p>', text: 'Lesson cancelled' }),
    );
    database([claimed('first'), claimed('broken', { body: 'broken' }), claimed('last')]);

    expect(await sendPendingNotifications()).toEqual({ sent: 2, failed: 1 });
    expect(told('system_mark_notification_failed')).toEqual([{ p_id: 'broken', p_error: 'Could not render the email.' }]);
    // What went out is marked, so the next run does not send it a second time.
    expect(told('system_mark_notifications_sent')).toEqual([{ p_ids: ['first', 'last'] }]);
  });

  it('a refusal is marked failed and then sent, so it is not tried five times', async () => {
    database([claimed('refused')]);
    sendEmail.mockResolvedValue({ ok: false, reason: 'REJECTED', message: 'That address does not exist.' });

    expect(await sendPendingNotifications()).toEqual({ sent: 0, failed: 1 });
    expect(told('system_mark_notification_failed')).toEqual([{ p_id: 'refused', p_error: 'That address does not exist.' }]);
    expect(told('system_mark_notifications_sent')).toEqual([{ p_ids: ['refused'] }]);
  });
});
