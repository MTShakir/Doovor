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

const { addLearnerNote, deleteLearnerNote } = await import('./actions');

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
