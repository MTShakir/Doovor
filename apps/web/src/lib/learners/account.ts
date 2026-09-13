import 'server-only';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

export type UnclaimedAccount = { ok: true; userId: string } | { ok: false; taken: boolean };

export interface UnclaimedLearner {
  fullName: string;
  email: string | null;
  phone: string | null;
}

/**
 * The account a learner added by hand will claim later (LRN-03, D-068).
 *
 * Creating an identity is Supabase Auth's job and the secret key is the only way to ask it,
 * so this is the one place that key acts for a signed-in person. It touches identities and
 * nothing else: no tenant table, no reading of anybody's data, and only after the caller has
 * been checked. Everything after this goes through their own session and the policies.
 */
export async function createUnclaimedLearnerAccount(learner: UnclaimedLearner): Promise<UnclaimedAccount> {
  const { data, error } = await getSupabaseServiceClient().auth.admin.createUser({
    email: learner.email ?? undefined,
    phone: learner.phone ?? undefined,
    // Unconfirmed on purpose: confirming it is how the learner takes the account over.
    email_confirm: false,
    phone_confirm: false,
    user_metadata: { full_name: learner.fullName, intended_role: 'learner' },
  });

  if (error) {
    // Anything already in use comes back as a registration conflict. We do not say whose.
    const taken = /already|exists|registered|duplicate/i.test(error.message);
    return { ok: false, taken };
  }
  return { ok: true, userId: data.user.id };
}

/** Undoes the account above when the step after it fails, so no orphan is left behind. */
export async function removeUnclaimedLearnerAccount(userId: string): Promise<void> {
  await getSupabaseServiceClient().auth.admin.deleteUser(userId);
}
