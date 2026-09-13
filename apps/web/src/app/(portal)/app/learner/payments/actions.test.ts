import { beforeEach, describe, expect, it, vi } from 'vitest';

const keptCardsWith = vi.fn<(id: string) => Promise<unknown>>();
const forgetSavedCard = vi.fn();

vi.mock('@/lib/auth/session', () => ({ requirePortal: () => Promise.resolve({ session: { userId: 'learner-1' } }) }));
vi.mock('@/lib/payments/cards', () => ({ keptCardsWith: (id: string) => keptCardsWith(id) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ forgetSavedCard }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { forgetCard } = await import('./actions');

const businessId = '0b6f5e1a-3c2d-4e8f-9a7b-1c2d3e4f5a6b';

beforeEach(() => {
  vi.clearAllMocks();
  keptCardsWith.mockResolvedValue({
    businessId,
    businessName: 'Quayside Driving School',
    accountId: 'acct_1',
    customerId: 'cus_lee',
    cards: [],
  });
  forgetSavedCard.mockResolvedValue({ ok: true, data: null });
});

describe('removing a kept card (PAY-02, M3-07)', () => {
  it('removes it from the learner’s own customer on that Business’s account', async () => {
    expect(await forgetCard({ businessId, paymentMethodId: 'pm_kept' })).toEqual({ ok: true, data: null });
    expect(keptCardsWith).toHaveBeenCalledWith(businessId);
    expect(forgetSavedCard).toHaveBeenCalledWith({ accountId: 'acct_1', customerId: 'cus_lee', paymentMethodId: 'pm_kept' });
  });

  it('removes nothing for somebody with no cards at that Business', async () => {
    keptCardsWith.mockResolvedValue(null);

    expect(await forgetCard({ businessId, paymentMethodId: 'pm_kept' })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(forgetSavedCard).not.toHaveBeenCalled();
  });

  it('says a card that is not theirs is not there', async () => {
    forgetSavedCard.mockResolvedValue({ ok: false, reason: 'NOT_FOUND', message: 'Not theirs.' });

    expect(await forgetCard({ businessId, paymentMethodId: 'pm_other' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'That card is not saved any more.',
    });
  });

  it('asks them to try again when the provider cannot be reached', async () => {
    forgetSavedCard.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'Down.' });

    expect(await forgetCard({ businessId, paymentMethodId: 'pm_kept' })).toMatchObject({ ok: false, code: 'UNKNOWN' });
  });

  it('refuses what is not a Business and a card', async () => {
    expect(await forgetCard({ businessId: 'nope', paymentMethodId: 'pm_kept' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(forgetSavedCard).not.toHaveBeenCalled();
  });
});
