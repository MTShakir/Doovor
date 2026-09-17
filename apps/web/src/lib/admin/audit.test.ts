import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { AUDIT_PAGE_SIZE, auditLog } = await import('./audit');

const everything = { kind: undefined, person: '', business: '', from: undefined, to: undefined, before: undefined };

function row(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `entry-${String(index)}`,
    // Newest first, a minute apart, with the database's own fraction of a second.
    occurred_at: new Date(Date.UTC(2026, 8, 17, 11, 0) - index * 60_000).toISOString().replace('Z', '418959+00:00').replace('.000', '.'),
    action: 'impersonation.started',
    actor_name: 'Sue Staff',
    actor_email: 'sue@example.com',
    actor_role: 'support_admin',
    entity: 'user',
    about_name: 'Lee One',
    about_email: 'lee@example.com',
    business_name: null,
    before: null,
    after: { reason: 'Missing lesson' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the audit log for platform staff (ADM-07, NFR-SEC-06, M5-22)', () => {
  it('says what happened, when in London, who did it and whom it was about', async () => {
    rpc.mockResolvedValueOnce({ data: [row(0)], error: null });
    expect(await auditLog(everything)).toEqual({
      entries: [
        {
          id: 'entry-0',
          occurredAt: '2026-09-17T11:00:00.418959+00:00',
          when: 'Thu 17 Sep 2026, 12:00',
          what: 'Staff started viewing as them',
          action: 'impersonation.started',
          who: 'Sue Staff (sue@example.com)',
          role: 'support_admin',
          about: 'Lee One (lee@example.com)',
          business: null,
          before: null,
          after: { reason: 'Missing lesson' },
        },
      ],
      older: null,
    });
    // Asking for one more than a page shows whether there is an older one.
    expect(rpc).toHaveBeenLastCalledWith('admin_audit_log', { p_limit: AUDIT_PAGE_SIZE + 1 });
  });

  it('names the platform for what nobody did by hand, and an account that has gone', async () => {
    rpc.mockResolvedValueOnce({
      data: [
        row(0, { action: 'booking.hold_expired', actor_name: null, actor_email: null, actor_role: 'system', about_name: null, about_email: null, business_name: 'Bee School' }),
        row(1, { action: 'auth.sign_in', actor_name: null, actor_email: null, actor_role: 'user' }),
        row(2, { action: 'something.new', actor_name: '', actor_email: 'ann@example.com', actor_role: 'owner' }),
      ],
      error: null,
    });
    const { entries } = await auditLog(everything);
    expect(entries.map(({ what, who, about, business }) => ({ what, who, about, business }))).toEqual([
      { what: 'Unpaid hold on a lesson lapsed', who: 'The platform', about: null, business: 'Bee School' },
      { what: 'Signed in', who: 'An account since deleted', about: 'Lee One (lee@example.com)', business: null },
      { what: 'something.new', who: 'ann@example.com', about: 'Lee One (lee@example.com)', business: null },
    ]);
  });

  it('asks for the actions of a kind, a person, a Business and London days, from where the last page stopped', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const before = { at: '2026-09-17T11:13:17.418959+00:00', id: '0b7e8c1d-2f3a-4b5c-8d6e-7f8091a2b3c4' };
    expect(await auditLog({ kind: 'viewing', person: 'lee', business: 'Bee', from: '2026-09-01', to: '2026-09-17', before })).toEqual({
      entries: [],
      older: null,
    });
    expect(rpc).toHaveBeenLastCalledWith('admin_audit_log', {
      p_actions: ['impersonation.started', 'impersonation.ended'],
      p_person: 'lee',
      p_business: 'Bee',
      p_from: '2026-09-01',
      p_to: '2026-09-17',
      p_before_at: before.at,
      p_before_id: before.id,
      p_limit: AUDIT_PAGE_SIZE + 1,
    });
  });

  it('shows a page, and says where the older one starts when there is more', async () => {
    rpc.mockResolvedValueOnce({ data: Array.from({ length: AUDIT_PAGE_SIZE + 1 }, (_, index) => row(index)), error: null });
    const page = await auditLog(everything);
    expect(page.entries).toHaveLength(AUDIT_PAGE_SIZE);
    const last = row(AUDIT_PAGE_SIZE - 1);
    expect(page.older).toEqual({ at: last.occurred_at, id: last.id });
  });

  it('fails loudly rather than showing an empty log', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ALLOWED' } });
    await expect(auditLog(everything)).rejects.toThrow('Could not read the audit log: NOT_ALLOWED');
  });
});
