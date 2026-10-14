import { brand } from '@repo/config/brand';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifyWelcome, planWelcome } = await import('./welcome-notices');

const ian = { user_id: 'user-1', full_name: 'Ian Newcomer', audience: 'instructor' as const };

type Answers = Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>;

/** Answers each `system_*` function by name, the way the database would. */
function database(answers: Answers) {
  rpc.mockImplementation((name: string, args: Record<string, unknown> = {}) => {
    const answer = answers[name];
    if (answer === undefined) throw new Error(`Nothing answers ${name}`);
    return Promise.resolve(answer(args));
  });
}

const rowsWritten = () =>
  rpc.mock.calls.filter(([name]) => name === 'system_notify').flatMap(([, args]) => (args as { p_rows: Record<string, unknown>[] }).p_rows);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the welcome, once an email is confirmed (NTF-03, NTF-06, D-259)', () => {
  it('welcomes them in the inbox and by email, says what is next for their side, and how to get help', () => {
    const [welcome, ...more] = planWelcome(ian);
    expect(more).toEqual([]);
    expect(welcome).toMatchObject({
      userId: 'user-1',
      audience: 'instructor',
      channels: ['in_app', 'email'],
      title: `Welcome to ${brand.name}`,
      link: '/start',
    });
    expect(welcome?.body).toContain('Finish setting up');
    expect(welcome?.body).toContain(brand.supportEmail);
  });

  it('writes it once for the person, about nobody else and no Business', async () => {
    database({
      system_welcome_notice: (args) => ({ data: args.p_user_id === 'user-1' ? ian : null, error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifyWelcome('user-1')).toEqual({ written: 1 });
    expect(rowsWritten()).toEqual([
      expect.objectContaining({
        user_id: 'user-1',
        business_id: null,
        kind: 'account.welcome',
        entity_type: 'user',
        entity_id: 'user-1',
        dedupe_key: 'account.welcome:user-1:0:user-1',
      }),
    ]);
  });

  it('writes nothing for an account that is gone, and says so when the database cannot be read', async () => {
    database({ system_welcome_notice: () => ({ data: null, error: null }) });
    expect(await notifyWelcome('user-2')).toEqual({ written: 0 });

    database({ system_welcome_notice: () => ({ data: null, error: { message: 'down' } }) });
    await expect(notifyWelcome('user-1')).rejects.toThrow('Could not read who to welcome: down');
  });
});
