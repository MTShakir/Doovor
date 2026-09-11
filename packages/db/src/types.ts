import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.gen';

export type { CompositeTypes, Database, Enums, Json, Tables, TablesInsert, TablesUpdate } from './types.gen';

/** A Supabase client typed against this database. Pass the user's session client. */
export type DbClient = SupabaseClient<Database>;

export type MembershipRole = Database['public']['Enums']['membership_role'];
export type BusinessType = Database['public']['Enums']['business_type'];
export type PlatformRole = Database['public']['Enums']['platform_role'];
