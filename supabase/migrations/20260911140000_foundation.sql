-- Foundation: extensions, the private schema, default-deny grants and shared utilities.
-- ARCHITECTURE.md section 6. Migrations are forward only.

create extension if not exists btree_gist with schema extensions;
create extension if not exists postgis with schema extensions;

-- Helpers used by RLS policies live here. PostgREST does not expose this schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- Default deny: tables and functions created from now on grant nothing to the API roles
-- unless a migration grants it explicitly. service_role keeps Supabase's defaults.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

-- updated_at maintenance for every table.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- URL-safe slug from free text: lower case, letters and digits joined by single hyphens.
create or replace function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(p_value), '[^a-z0-9]+', '-', 'g')), ''),
    'n'
  );
$$;

-- Enumerations. They can grow in later phases (ALTER TYPE ... ADD VALUE).
create type public.platform_role as enum ('super_admin', 'support_admin');
create type public.business_type as enum ('independent', 'school');
create type public.business_status as enum ('pending', 'active', 'suspended');
create type public.plan_key as enum ('free', 'pro', 'school');
create type public.membership_role as enum ('owner', 'manager', 'instructor');
create type public.membership_status as enum ('invited', 'active', 'deactivated');
create type public.intended_role as enum ('learner', 'instructor', 'school');

-- Platform settings (ADM-05). Values are launch defaults from PRD 9.18 and 11.1.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function private.set_updated_at();

alter table public.platform_settings enable row level security;

insert into public.platform_settings (key, value, description) values
  ('founding_offer', '{"months": 12, "instructor_limit": 500, "school_limit": 50}',
   'Paid plan free for 12 months for the first 500 instructors and 50 schools (PRD 9.18)'),
  ('booking_defaults', '{"buffer_minutes": 30, "notice_hours": 24, "horizon_weeks": 8, "cancellation_window_hours": 48, "late_fee_percent": 100, "request_expiry_hours": 12, "reminder_hours": [24, 2]}',
   'Default booking rules (PRD 11.1)'),
  ('marketplace_switch_on', '{"verified_instructors": 25, "open_hours_14_days": 150}',
   'Regional marketplace thresholds (PRD 4.2)');
