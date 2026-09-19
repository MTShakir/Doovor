import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const insert = vi.fn();
const removeWhere = vi.fn();
const from = vi.fn((table: string) => {
  if (table === 'learner_relationships') {
    return { select: () => ({ eq: () => ({ maybeSingle }) }) };
  }
  return { insert, delete: () => ({ eq: removeWhere }) };
});

const requirePortal = vi.fn(() =>
  Promise.resolve({ session: { userId: 'author-1', email: null, aal: 'aal1' }, access: {} }),
);

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => ({ from }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const savePickupPoint = vi.fn<(input: unknown, target: unknown) => Promise<unknown>>();
const updatePickupPoint = vi.fn<(id: string, input: unknown) => Promise<unknown>>();
const removePickupPoint = vi.fn<(id: string) => Promise<unknown>>();
vi.mock('@/lib/pickup/save', () => ({
  savePickupPoint: (input: unknown, target: unknown) => savePickupPoint(input, target),
  updatePickupPoint: (id: string, input: unknown) => updatePickupPoint(id, input),
  removePickupPoint: (id: string) => removePickupPoint(id),
}));

const { addLearnerNote, addLearnerPickup, deleteLearnerNote, removeLearnerPickup, updateLearnerPickup } = await import('./actions');

const learnerId = '11111111-1111-4111-8111-111111111111';
const noteId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: { business_id: 'biz-1' }, error: null });
  insert.mockResolvedValue({ error: null });
  removeWhere.mockResolvedValue({ error: null });
});

describe('addLearnerNote (LRN-04, M2-06)', () => {
  it('writes the note against the Business the learner is in, by the person signed in', async () => {
    const result = await addLearnerNote({ learnerId, body: '  Nervous on roundabouts.  ' });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      business_id: 'biz-1',
      learner_id: learnerId,
      author_id: 'author-1',
      // Trimmed by the schema both sides share.
      body: 'Nervous on roundabouts.',
    });
  });

  it('asks for something to be written', async () => {
    const result = await addLearnerNote({ learnerId, body: '   ' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok ? null : result.fields?.body).toBe('Write the note first');
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a note longer than the column holds', async () => {
    const result = await addLearnerNote({ learnerId, body: 'x'.repeat(5001) });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a learner who is not one of theirs, before writing anything', async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await addLearnerNote({ learnerId, body: 'Hello' });

    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('passes on what the database refused, rather than throwing at the browser', async () => {
    insert.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } });

    const result = await addLearnerNote({ learnerId, body: 'Hello' });

    expect(result).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });
});

describe('deleteLearnerNote (LRN-04, M2-06)', () => {
  it('deletes by id, and lets the policy decide whether it was theirs to delete', async () => {
    const result = await deleteLearnerNote({ id: noteId, learnerId });

    expect(result.ok).toBe(true);
    expect(removeWhere).toHaveBeenCalledWith('id', noteId);
  });

  it('refuses something that is not an id', async () => {
    const result = await deleteLearnerNote({ id: 'not-an-id', learnerId });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(removeWhere).not.toHaveBeenCalled();
  });
});

describe("keeping a learner's pickup points from their card (COV-04, D-168)", () => {
  const pickupId = '33333333-3333-4333-8333-333333333333';
  const pickup = { kind: 'home', label: '', address: '1 Park Lane, Leeds', postcode: 'LS2 9JT', isDefault: true };

  it('adds one for the Business the learner is with, never one the caller names', async () => {
    savePickupPoint.mockResolvedValue({ ok: true, data: { id: pickupId } });
    expect(await addLearnerPickup({ learnerId, pickup, businessId: 'somebody-else' })).toEqual({ ok: true, data: null });
    expect(savePickupPoint).toHaveBeenCalledWith(pickup, { learnerId, businessId: 'biz-1' });
  });

  it('adds nothing for a learner who is not theirs', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await addLearnerPickup({ learnerId, pickup })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(savePickupPoint).not.toHaveBeenCalled();
  });

  it('passes on what the address check said', async () => {
    savePickupPoint.mockResolvedValue({ ok: false, code: 'VALIDATION_FAILED', message: 'Check it', fields: { postcode: 'Enter a UK postcode' } });
    expect(await addLearnerPickup({ learnerId, pickup })).toMatchObject({ ok: false, fields: { postcode: 'Enter a UK postcode' } });
  });

  it('corrects and removes one by its id, where the policies decide which may be touched', async () => {
    updatePickupPoint.mockResolvedValue({ ok: true, data: null });
    removePickupPoint.mockResolvedValue({ ok: true, data: null });
    expect(await updateLearnerPickup({ learnerId, pickupId, pickup })).toEqual({ ok: true, data: null });
    expect(updatePickupPoint).toHaveBeenCalledWith(pickupId, pickup);
    expect(await removeLearnerPickup({ learnerId, pickupId })).toEqual({ ok: true, data: null });
    expect(removePickupPoint).toHaveBeenCalledWith(pickupId);
  });

  it('asks nothing for something that is not an id', async () => {
    expect(await updateLearnerPickup({ learnerId, pickupId: 'nope', pickup })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await removeLearnerPickup({ learnerId: 'nope', pickupId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(updatePickupPoint).not.toHaveBeenCalled();
    expect(removePickupPoint).not.toHaveBeenCalled();
  });
});
