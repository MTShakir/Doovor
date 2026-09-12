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
