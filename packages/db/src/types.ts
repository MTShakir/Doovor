import type { LedgerKind } from '@repo/core/credit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.gen';

export type { CompositeTypes, Database, Enums, Json, Tables, TablesInsert, TablesUpdate } from './types.gen';

/**
 * A Supabase client typed against this database. Pass the user's session client.
 *
 * Structural on purpose: pnpm installs a second copy of the client library when peer
 * dependencies differ between packages (the job runner brings OpenTelemetry, for example),
 * and two copies of the same class are not interchangeable. Helpers here only need the query
 * entry points, so they accept any of them.
 */
export type DbClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

export type MembershipRole = Database['public']['Enums']['membership_role'];
export type BusinessType = Database['public']['Enums']['business_type'];
export type PlatformRole = Database['public']['Enums']['platform_role'];
export type CreditEntryKind = Database['public']['Enums']['credit_entry_kind'];

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Holds<T extends true> = T;

/**
 * The moves the credit rules in core decide are exactly the ones the ledger records (M3-12). A
 * kind added to one and not the other stops the build here rather than at the first refund.
 */
export type LedgerKindsMatch = Holds<Same<LedgerKind, CreditEntryKind>>;
