import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const savePrices = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const savePackage = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const expireAll = vi.fn<() => void>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/catalogue/save', () => ({
  savePrices: (...args: unknown[]) => savePrices(...args),
  savePackage: (...args: unknown[]) => savePackage(...args),
}));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAll(); } }));

const { saveLessonSeller, saveLinkedPriceGuide, saveSchoolPackage, saveSchoolPrices, saveSchoolRules } = await import('./actions');

const manager = { businessId: 'school-1', businessType: 'school', role: 'manager' };
const rules = { noticeHours: '24', horizonWeeks: '8', cancellationWindowHours: '24', lateFeePercent: '50', requestExpiryHours: '12', reminderHoursBefore: '24,2' };

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [manager] } });
  rpc.mockResolvedValue({ data: null, error: null });
  savePrices.mockResolvedValue({ ok: true, data: null });
  savePackage.mockResolvedValue({ ok: true, data: { packageId: 'p-1' } });
});

describe('the school settings (SCH-04, M5-15)', () => {
  it('saves the school prices and packages for the school the person runs', async () => {
    await saveSchoolPrices({ prices: [] });
    expect(savePrices).toHaveBeenCalledWith('school-1', null, { prices: [] });
    await saveSchoolPackage({ packageId: null });
    expect(savePackage).toHaveBeenCalledWith('school-1', { packageId: null });
  });

  it('saves the rules for the whole school, then has every profile read them fresh (R-06)', async () => {
    expect(await saveSchoolRules(rules)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_booking_rules', {
      p_business_id: 'school-1',
      p_rules: {
        notice_hours: 24,
        horizon_weeks: 8,
        cancellation_window_hours: 24,
        late_fee_percent: 50,
        request_expiry_hours: 12,
        reminder_hours_before: [24, 2],
      },
    });
    expect(expireAll).toHaveBeenCalled();
  });

  it('is for somebody running a school, and says what to fix', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...manager, role: 'instructor' }] } });
    expect(await saveSchoolPrices({ prices: [] })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveSchoolPackage({})).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveSchoolRules(rules)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(savePrices).not.toHaveBeenCalled();

    expect(await saveSchoolRules({ ...rules, lateFeePercent: '30' })).toMatchObject({
      ok: false,
      fields: { lateFeePercent: 'Choose 0, 50 or 100 per cent' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('who sells the school\'s lessons (D-281)', () => {
  const owner = { businessId: 'school-1', businessType: 'school', role: 'owner' };

  it('is said by the owner, through the database\'s own door', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [owner] } });
    expect(await saveLessonSeller({ lessonSeller: 'both' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_lesson_seller', { p_business_id: 'school-1', p_seller: 'both' });
  });

  it('is not the manager\'s to say, and needs an answer', async () => {
    expect(await saveLessonSeller({ lessonSeller: 'both' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveLessonSeller({})).toMatchObject({ code: 'VALIDATION_FAILED', fields: { lessonSeller: 'Choose who sells your lessons' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says why the instructors cannot sell every lesson while some teach under the school', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [owner] } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "seller", "reason": "instructors_teach_here"}' } });
    expect(await saveLessonSeller({ lessonSeller: 'instructors' })).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { lessonSeller: 'Some of your instructors still teach under the school. Choose Some of each while they move to their own.' },
    });
  });

  it('says why the school cannot sell every lesson while instructors are linked to it (D-320)', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [owner] } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "seller", "reason": "linked_instructors"}' } });
    expect(await saveLessonSeller({ lessonSeller: 'school' })).toMatchObject({
      code: 'VALIDATION_FAILED',
      fields: { lessonSeller: 'Some instructors linked to the school sell their own lessons. Choose Some of each while they are linked.' },
    });
  });
});

describe('prices for linked instructors (M9-10, D-286)', () => {
  it("saves what the school recommends and the most, in pence, through the database's own door", async () => {
    expect(await saveLinkedPriceGuide({ recommended: '40', maximum: '45' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_linked_price_guide', { p_school_id: 'school-1', p_recommended_hourly_pence: 4000, p_max_hourly_pence: 4500 });
  });

  it('leaves out what is left empty, which is none', async () => {
    await saveLinkedPriceGuide({ recommended: '', maximum: '' });
    expect(rpc).toHaveBeenCalledWith('set_linked_price_guide', { p_school_id: 'school-1', p_recommended_hourly_pence: undefined, p_max_hourly_pence: undefined });
  });

  it('says what to fix, and is for somebody running the school', async () => {
    expect(await saveLinkedPriceGuide({ recommended: '50', maximum: '45' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { recommended: 'Recommend no more than the most they can charge' },
    });
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "recommended", "reason": "above_maximum"}' } });
    expect(await saveLinkedPriceGuide({ recommended: '40', maximum: '45' })).toMatchObject({ fields: { recommended: 'Recommend no more than the most they can charge' } });
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...manager, role: 'instructor' }] } });
    rpc.mockClear();
    expect(await saveLinkedPriceGuide({ recommended: '40', maximum: '45' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
