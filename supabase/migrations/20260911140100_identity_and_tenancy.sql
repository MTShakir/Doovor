-- Identity and tenancy (PRD 6.1, 12): users, platform staff, businesses, memberships, invitations.

-- ---------------------------------------------------------------------------------------
-- Users: one row per auth user, created by trigger on sign-up.
-- ---------------------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  email_verified_at timestamptz,
  phone text,
  phone_verified_at timestamptz,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  locale text not null default 'en-GB',
  timezone text not null default 'Europe/London',
  intended_role public.intended_role,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  analytics_consent boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_email_idx on public.users (lower(email));

create trigger users_updated_at
  before update on public.users
  for each row execute function private.set_updated_at();

-- Keep marketing consent timestamps honest (PECR, NFR-PRV-05).
create or replace function private.users_consent_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.marketing_consent is distinct from old.marketing_consent then
    new.marketing_consent_at := case when new.marketing_consent then now() else null end;
  end if;
  return new;
end;
$$;

create trigger users_consent_timestamps
  before update of marketing_consent on public.users
  for each row execute function private.users_consent_timestamps();

-- Create the profile row when someone signs up (any method: password, magic link, OAuth).
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := v_meta ->> 'intended_role';
begin
  insert into public.users (id, email, email_verified_at, phone, phone_verified_at, full_name, avatar_url, intended_role)
  values (
    new.id,
    new.email,
    new.email_confirmed_at,
    new.phone,
    new.phone_confirmed_at,
    left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), nullif(trim(v_meta ->> 'name'), ''), ''), 120),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    case when v_role in ('learner', 'instructor', 'school') then v_role::public.intended_role end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Mirror verified email and phone changes made through Supabase Auth.
create or replace function private.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
     set email = new.email,
         email_verified_at = new.email_confirmed_at,
         phone = new.phone,
         phone_verified_at = new.phone_confirmed_at
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_updated
  after update of email, email_confirmed_at, phone, phone_confirmed_at on auth.users
  for each row execute function private.handle_auth_user_updated();

-- ---------------------------------------------------------------------------------------
-- Platform staff (Super Admin, Support Admin).
-- ---------------------------------------------------------------------------------------
create table public.platform_staff (
  user_id uuid primary key references public.users (id) on delete cascade,
  role public.platform_role not null,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger platform_staff_updated_at
  before update on public.platform_staff
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Businesses: the tenant. An independent instructor is a Business of one.
-- ---------------------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  type public.business_type not null,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url text,
  base_postcode text,
  base_location extensions.geography(point, 4326),
  address jsonb check (address is null or jsonb_typeof(address) = 'object'),
  timezone text not null default 'Europe/London',
  vat_number text,
  stripe_account_id text unique,
  stripe_charges_enabled boolean not null default false,
  plan public.plan_key not null default 'free',
  plan_expires_at timestamptz,
  founding_offer boolean not null default false,
  status public.business_status not null default 'active',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger businesses_updated_at
  before update on public.businesses
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Memberships: a person's role in a Business.
-- ---------------------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.membership_role not null,
  status public.membership_status not null default 'active',
  -- Per-member overrides of role defaults (SCH-02), for example {"view_revenue": true}.
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  invited_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id) where status = 'active';

create trigger memberships_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Invitations for instructors, managers (SCH-02) and learners (AUTH-07).
-- Only a SHA-256 hash of the token is stored; the token itself travels in the link.
-- ---------------------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('member', 'learner')),
  role public.membership_role,
  instructor_id uuid,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'link')),
  email text,
  phone text,
  full_name text,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references public.users (id),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.users (id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'member') = (role is not null))
);

create index invitations_business_idx on public.invitations (business_id);

create trigger invitations_updated_at
  before update on public.invitations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Row-level security on. Policies and grants follow in the next migration.
-- ---------------------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.platform_staff enable row level security;
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
