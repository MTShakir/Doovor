import 'server-only';
import { getSupabaseServiceClient } from '@/lib/supabase/service';

/** Windows older than a day tell nobody anything (NFR-SEC-03, M2-02). */
export async function clearOldRateLimits(): Promise<{ cleared: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_clear_rate_limits', {
    p_older_than: '1 day',
  });
  if (error) throw new Error(`Could not clear old rate limits: ${error.message}`);
  return { cleared: data };
}

/** Requests nobody answered stop holding a slot the moment they lapse (R-12, M2-18). */
export async function expireBookingRequests(): Promise<{ expired: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_expire_requests');
  if (error) throw new Error(`Could not expire booking requests: ${error.message}`);
  return { expired: data };
}

/** Invitations nobody accepted are of no use after a month (AUTH-07). */
export async function clearExpiredInvitations(): Promise<{ cleared: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_clear_expired_invitations', {
    p_older_than: '30 days',
  });
  if (error) throw new Error(`Could not clear expired invitations: ${error.message}`);
  return { cleared: data };
}

/**
 * Pictures nothing points to any more, a day on: a badge once it has been checked, a photo or a
 * logo once it has been replaced, and a deleted person's (NFR-PRV-03, D-158).
 *
 * The database says which; storage is told to remove them, a bucket at a time. This is the one
 * place the secret key reaches storage, and it only ever removes what the database has listed.
 */
export async function removeUnreferencedFiles(): Promise<{ removed: number }> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service.rpc('system_unreferenced_files');
  if (error) throw new Error(`Could not list the pictures nothing uses: ${error.message}`);

  const byBucket = new Map<string, string[]>();
  for (const file of data) byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.name]);

  let removed = 0;
  for (const [bucket, names] of byBucket) {
    const { data: gone, error: problem } = await service.storage.from(bucket).remove(names);
    if (problem) throw new Error(`Could not remove pictures from ${bucket}: ${problem.message}`);
    removed += gone.length;
  }
  return { removed };
}

/** The audit trail keeps two years, as the privacy notice says (NFR-SEC-06, D-158). */
export async function pruneAuditTrail(): Promise<{ pruned: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_prune_audit_log');
  if (error) throw new Error(`Could not prune the audit trail: ${error.message}`);
  return { pruned: data };
}

/** Open ended weekly slots are kept booked a month ahead (BOK-05, M2-20). */
export async function extendRecurrences(): Promise<{ booked: number }> {
  const { data, error } = await getSupabaseServiceClient().rpc('system_extend_recurrences', { p_weeks: 4 });
  if (error) throw new Error(`Could not extend the weekly slots: ${error.message}`);
  return { booked: data };
}

/**
 * Accounts asked to be deleted, seven days on (NFR-PRV-03, AUTH-09, M6-12, D-149).
 *
 * The seven days are the person's to change their mind in. After that each one is carried out on
 * its own, so one that fails does not hold up the rest, and what is left of the record says only
 * that somebody paid, when, and how much.
 */
export async function eraseDueAccounts(): Promise<{ erased: number; failed: number }> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service.rpc('system_due_deletions');
  if (error) throw new Error(`Could not read the accounts due to be deleted: ${error.message}`);

  let erased = 0;
  let failed = 0;
  for (const due of data) {
    const { error: problem } = await service.rpc('system_finish_deletion', { p_request_id: due.request_id });
    if (problem) failed += 1;
    else erased += 1;
  }
  if (failed > 0 && erased === 0) throw new Error(`No account could be deleted, of ${String(failed)} due`);
  return { erased, failed };
}
