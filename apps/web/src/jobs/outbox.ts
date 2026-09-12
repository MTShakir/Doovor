import 'server-only';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { inngest } from './client';
import { dispatchOutbox, type DispatchResult, type OutboxStore } from './dispatch';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const store: OutboxStore = {
  claim: async (limit) => {
    const { data, error } = await getSupabaseServiceClient().rpc('system_claim_outbox_events', { p_limit: limit });
    if (error) throw new Error(`Could not claim outbox events: ${error.message}`);
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      // jsonb can hold a scalar; every event we write is an object of identifiers.
      payload: isRecord(row.payload) ? row.payload : {},
      attempts: row.attempts,
    }));
  },
  markSent: async (ids) => {
    const { error } = await getSupabaseServiceClient().rpc('system_mark_outbox_sent', { p_ids: ids });
    if (error) throw new Error(`Could not mark outbox events sent: ${error.message}`);
  },
  markFailed: async (ids, reason) => {
    const { error } = await getSupabaseServiceClient().rpc('system_mark_outbox_failed', { p_ids: ids, p_error: reason });
    if (error) throw new Error(`Could not record an outbox failure: ${error.message}`);
  },
};

/**
 * Sends whatever is waiting. Call it after an RPC that enqueued something, and let the
 * one-minute sweep catch anything missed (D-017).
 */
export function sendPendingEvents(limit = 50): Promise<DispatchResult> {
  return dispatchOutbox(store, (events) => inngest.send(events).then(() => undefined), limit);
}
