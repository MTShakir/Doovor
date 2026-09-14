import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const revalidatePath = vi.fn();
const access = { memberships: [{ businessId: 'business-1', role: 'owner', instructorProfileId: 'profile-1' }] };

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: () => ({ update }) }),
}));
vi.mock('@/lib/auth/session', () => ({ requireAccess: () => Promise.resolve({ session: { userId: 'owner-1' }, access }) }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { saveReceiptDetails } = await import('./receipt-details-actions');

beforeEach(() => {
  vi.clearAllMocks();
  access.memberships = [{ businessId: 'business-1', role: 'owner', instructorProfileId: 'profile-1' }];
  update.mockReturnValue({ eq });
  eq.mockReturnValue({ select });
  select.mockResolvedValue({ data: [{ id: 'business-1' }], error: null });
});

describe('what goes on receipts (PAY-08, M3-20)', () => {
  it('saves the address with its postcode tidied, and a VAT number only when there is one', async () => {
    expect(
      await saveReceiptDetails({ line1: '4 Quay Street', line2: '', town: 'Manchester', postcode: 'm12qf', vatNumber: 'gb 123456789' }),
    ).toEqual({ ok: true, data: { vatRegistered: true } });
    expect(update).toHaveBeenCalledWith({
      address: { line1: '4 Quay Street', line2: null, town: 'Manchester', postcode: 'M1 2QF' },
      vat_number: 'GB123456789',
    });
    expect(eq).toHaveBeenCalledWith('id', 'business-1');
    expect(revalidatePath).toHaveBeenCalledWith('/app/school/money');

    expect(await saveReceiptDetails({ line1: '4 Quay Street', town: 'Manchester', postcode: 'M1 2QF', vatNumber: '' })).toEqual({
      ok: true,
      data: { vatRegistered: false },
    });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ vat_number: null }));
  });

  it('says what is wrong, field by field, and saves nothing', async () => {
    const result = await saveReceiptDetails({ line1: '', town: 'Manchester', postcode: 'nowhere', vatNumber: '12' });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { line1: 'Add the first line of the address', postcode: 'Enter a UK postcode, like M1 2QF' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('is for the owner only', async () => {
    access.memberships = [{ businessId: 'business-1', role: 'instructor', instructorProfileId: 'profile-2' }];
    expect(await saveReceiptDetails({ line1: 'A', town: 'B', postcode: 'M1 2QF' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(update).not.toHaveBeenCalled();

    access.memberships = [{ businessId: 'business-1', role: 'owner', instructorProfileId: 'profile-1' }];
    select.mockResolvedValueOnce({ data: [], error: null });
    expect(await saveReceiptDetails({ line1: 'A', town: 'B', postcode: 'M1 2QF' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});
