import 'server-only';
import { defaultErrorCopy, parsePostgresError, type DomainErrorCode, type PostgresErrorLike } from '@repo/core/errors';
import { manualLearnerSchema } from '@repo/core/schemas/learner';
import { z } from '@repo/core/zod';
import { createUnclaimedLearnerAccount, removeUnclaimedLearnerAccount } from '@/lib/learners/account';
import type { createSupabaseServerClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Adding learners by hand and from a spreadsheet (LRN-03), for an instructor's own list and for a
 * school's (M9-27): the rules are the same, and only the database's door differs.
 */

/** Somebody already on this Business's list with the same number or address (LRN-03). */
export async function alreadyHere(
  supabase: Supabase,
  businessId: string,
  contact: { email: string | null; phone: string | null },
): Promise<string | null> {
  const here = async (column: 'email' | 'phone', value: string): Promise<string | null> => {
    const { data } = await supabase
      .from('learner_list')
      .select('full_name')
      .eq('business_id', businessId)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    return data?.full_name ?? null;
  };

  // Supabase Auth keeps a number without its plus, which is how it reaches the list.
  const byPhone = contact.phone === null ? null : await here('phone', contact.phone.replace('+', ''));
  if (byPhone !== null) return byPhone;
  return contact.email === null ? null : await here('email', contact.email);
}

export interface NewLearner {
  fullName: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  transmission: 'manual' | 'automatic' | null;
}

export type Linked = { ok: true; learnerId: string } | { ok: false; code: DomainErrorCode; reason: string };

/**
 * One learner who has never heard of us: the account they will claim later (D-068), then the
 * link to the Business through the caller's own session, by the door given. Shared by typing
 * somebody in and by importing a hundred of them, because the rules are the same either way.
 */
export async function linkNewLearner(
  supabase: Supabase,
  businessId: string,
  learner: NewLearner,
  link: (learnerId: string) => PromiseLike<{ error: PostgresErrorLike | null }>,
): Promise<Linked> {
  const existing = await alreadyHere(supabase, businessId, learner);
  if (existing !== null) {
    return { ok: false, code: 'DUPLICATE_CONTACT', reason: `${existing} is already on your list with those details.` };
  }

  const account = await createUnclaimedLearnerAccount({
    fullName: learner.fullName,
    email: learner.email,
    phone: learner.phone,
  });
  if (!account.ok) {
    return account.taken
      ? {
          ok: false,
          code: 'DUPLICATE_CONTACT',
          reason: 'Those details already belong to an account. Send them a link instead, so they can join you themselves.',
        }
      : { ok: false, code: 'UNKNOWN', reason: 'We could not make their account. Try again.' };
  }

  const { error } = await link(account.userId);
  if (error) {
    // The account was ours and a moment old, so it goes rather than sits there unowned.
    await removeUnclaimedLearnerAccount(account.userId);
    const { code } = parsePostgresError(error);
    return { ok: false, code, reason: defaultErrorCopy[code] };
  }

  return { ok: true, learnerId: account.userId };
}

const importRowSchema = z.object({
  /** The line in the file, so a problem can be pointed at. */
  line: z.number().int().min(1),
  fullName: z.string().default(''),
  phone: z.string().default(''),
  email: z.string().default(''),
  postcode: z.string().default(''),
});

export const importSchema = z.object({
  // One batch at a time, so a long file reports as it goes rather than timing out in silence.
  rows: z.array(importRowSchema).min(1).max(25),
});

export interface ImportOutcome {
  imported: number;
  problems: { line: number; name: string; reason: string }[];
}

/**
 * A batch of rows from a spreadsheet. A row that cannot be imported is reported with its line
 * number and the reason, and the rest of the batch still goes in.
 */
export async function importRows(rows: z.output<typeof importSchema>['rows'], add: (learner: NewLearner) => Promise<Linked>): Promise<ImportOutcome> {
  const problems: ImportOutcome['problems'] = [];
  let imported = 0;
  for (const { line, ...row } of rows) {
    // A spreadsheet has no column for the gearbox, so that is asked for later, on the card.
    const details = manualLearnerSchema.safeParse({ ...row, transmission: '' });
    if (!details.success) {
      problems.push({ line, name: row.fullName, reason: details.error.issues[0]?.message ?? 'We could not read that row' });
      continue;
    }
    const result = await add(details.data);
    if (result.ok) imported += 1;
    else problems.push({ line, name: details.data.fullName, reason: result.reason });
  }
  return { imported, problems };
}
