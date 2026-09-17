import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const single = vi.fn();
const insert = vi.fn();
const update = vi.fn();
const eq = vi.fn();
const expireAll = vi.fn<() => void>();
const expireOne = vi.fn<(id: string) => void>();

const writeChain = { select: () => ({ single }), eq: (...args: unknown[]) => { eq(...args); return writeChain; } };
const from = vi.fn(() => ({
  insert: (row: unknown) => { insert(row); return writeChain; },
  update: (row: unknown) => { update(row); return writeChain; },
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from }) }));
vi.mock('@/lib/public/instructor-profile', () => ({
  expireAllInstructorProfiles: () => { expireAll(); },
  expireInstructorProfile: (id: string) => { expireOne(id); },
}));

const { savePackage, savePrices } = await import('./save');

const lessonTypeId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';
const packageId = '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  single.mockResolvedValue({ data: { id: packageId }, error: null });
});

describe('saving prices (R-05, SCH-04, M5-15)', () => {
  it('saves the Business prices in pence, blank ones taken off, and has every profile read them fresh', async () => {
    const result = await savePrices('school-1', null, {
      prices: [
        { lessonTypeId, durationMinutes: 60, price: '44' },
        { lessonTypeId, durationMinutes: 90, price: '' },
      ],
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_lesson_prices', {
      p_business_id: 'school-1',
      p_prices: [
        { lesson_type_id: lessonTypeId, duration_minutes: 60, price_pence: 4400 },
        { lesson_type_id: lessonTypeId, duration_minutes: 90, price_pence: null },
      ],
    });
    expect(expireAll).toHaveBeenCalled();
    expect(expireOne).not.toHaveBeenCalled();
  });

  it('saves an instructor their own prices, and only their profile is read fresh', async () => {
    await savePrices('school-1', 'profile-9', { prices: [{ lessonTypeId, durationMinutes: 60, price: '50' }] });
    expect(rpc).toHaveBeenCalledWith('set_lesson_prices', expect.objectContaining({ p_instructor_id: 'profile-9' }));
    expect(expireOne).toHaveBeenCalledWith('profile-9');
    expect(expireAll).not.toHaveBeenCalled();
  });

  it('puts a wrong price beside its field, and passes on a refusal', async () => {
    expect(await savePrices('school-1', null, { prices: [{ lessonTypeId, durationMinutes: 60, price: '2' }] })).toMatchObject({
      ok: false,
      fields: { 'prices.0.price': 'Enter a price between £5 and £1,000' },
    });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await savePrices('school-1', 'profile-9', { prices: [{ lessonTypeId, durationMinutes: 60, price: '50' }] })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
    expect(expireOne).not.toHaveBeenCalled();
  });
});

describe('saving a package (PAY-04, SCH-04, M5-15)', () => {
  it('adds a package to the Business, in minutes and pence', async () => {
    expect(await savePackage('school-1', { packageId: null, name: '10 hours', hours: '10', price: '420', expiryDays: '365', onSale: true })).toEqual({
      ok: true,
      data: { packageId },
    });
    expect(from).toHaveBeenCalledWith('packages');
    expect(insert).toHaveBeenCalledWith({ name: '10 hours', minutes: 600, price_pence: 42000, expiry_days: 365, is_active: true, business_id: 'school-1' });
    expect(expireAll).toHaveBeenCalled();
  });

  it('changes one of the Business packages only, and says when it could not', async () => {
    await savePackage('school-1', { packageId, name: 'Top up', hours: '5', price: '200', expiryDays: '', onSale: false });
    expect(update).toHaveBeenCalledWith({ name: 'Top up', minutes: 300, price_pence: 20000, expiry_days: null, is_active: false });
    expect(eq).toHaveBeenCalledWith('id', packageId);
    expect(eq).toHaveBeenCalledWith('business_id', 'school-1');

    single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    expect(await savePackage('school-1', { packageId, name: 'Top up', hours: '5', price: '200', expiryDays: '', onSale: false })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
      message: 'That package could not be saved. Try again.',
    });
    expect(await savePackage('school-1', { packageId: null, name: '', hours: '5', price: '200', expiryDays: '', onSale: true })).toMatchObject({
      ok: false,
      fields: { name: 'Name the package, like 10 hours' },
    });
  });
});
