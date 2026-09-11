-- Instructors, learners, relationships, private notes, pickup points and the postcode cache
-- (PRD 12, INS-01, LRN-01 to LRN-06, COV-03, COV-04, R-16, D-019).

create type public.instructor_qualification as enum ('adi', 'pdi');
create type public.verification_status as enum ('unsubmitted', 'pending', 'approved', 'rejected');
create type public.transmission as enum ('manual', 'automatic', 'both');
create type public.learner_transmission as enum ('manual', 'automatic');
create type public.experience_level as enum ('none', 'some', 'test_booked');
create type public.learner_status as enum ('enquiry', 'waiting', 'active', 'test_booked', 'passed', 'left');
create type public.learner_source as enum ('invite', 'marketplace', 'import', 'manual');
create type public.pickup_kind as enum ('home', 'school', 'work', 'custom');

-- ---------------------------------------------------------------------------------------
-- Postcode cache (COV-03). Public reference data, written only by the server.
-- ---------------------------------------------------------------------------------------
create table public.postcodes (
  postcode text primary key check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
  outcode text not null,
  area text not null check (area ~ '^[A-Z]{1,2}$'),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location extensions.geography(point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  admin_district text,
  region text,
  country text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index postcodes_outcode_idx on public.postcodes (outcode);

create trigger postcodes_updated_at
  before update on public.postcodes
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Instructor profiles (INS-01). One per instructor per Business.
-- ---------------------------------------------------------------------------------------
create table public.instructor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (char_length(bio) <= 300),
  photo_url text,
  languages text[] not null default '{English}',
  years_teaching smallint check (years_teaching between 0 and 70),
  qualification public.instructor_qualification not null default 'adi',
  badge_number text check (char_length(badge_number) <= 20),
  badge_expiry date,
  dbs_confirmed_at timestamptz,
  verification_status public.verification_status not null default 'unsubmitted',
  verified_at timestamptz,
  transmission public.transmission not null default 'manual',
  car_make text check (char_length(car_make) <= 40),
  car_model text check (char_length(car_model) <= 40),
  dual_controls boolean not null default true,
  specialisms text[] not null default '{}' check (
    specialisms <@ array['nervous_drivers', 'intensive_courses', 'pass_plus', 'motorway', 'refresher', 'test_prep']
  ),
  radius_miles smallint not null default 8 check (radius_miles between 1 and 30),
  base_postcode text,
  base_location extensions.geography(point, 4326),
  instant_book boolean not null default true,
  buffer_minutes smallint not null default 30 check (buffer_minutes between 0 and 60),
  public_slug text unique check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_listed boolean not null default true,
  -- R-18: a PDI must be supervised by a school or an ADI before taking bookings.
  supervisor_business_id uuid references public.businesses (id) on delete set null,
  supervisor_instructor_id uuid references public.instructor_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, business_id),
  unique (id, business_id)
);

create index instructor_profiles_business_idx on public.instructor_profiles (business_id);
create index instructor_profiles_user_idx on public.instructor_profiles (user_id);
create index instructor_profiles_location_idx on public.instructor_profiles using gist (base_location);

create trigger instructor_profiles_updated_at
  before update on public.instructor_profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Learners (AUTH-06). learner_private holds what only the learner may see (R-16, NFR-SEC-04).
-- ---------------------------------------------------------------------------------------
create table public.learner_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  postcode text,
  location extensions.geography(point, 4326),
  transmission public.learner_transmission,
  experience_level public.experience_level,
  provisional_licence_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger learner_profiles_updated_at
  before update on public.learner_profiles
  for each row execute function private.set_updated_at();

create table public.learner_private (
  user_id uuid primary key references public.users (id) on delete cascade,
  date_of_birth date check (date_of_birth > date '1900-01-01'),
  -- AES-256-GCM ciphertext with key version prefix (D-010). Never decrypted in SQL.
  licence_number_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger learner_private_updated_at
  before update on public.learner_private
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Learner relationships: how a global learner links to a Business (PRD 6.1, LRN-05).
-- ---------------------------------------------------------------------------------------
create table public.learner_relationships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references public.users (id) on delete cascade,
  instructor_id uuid,
  status public.learner_status not null default 'active',
  source public.learner_source not null default 'manual',
  usual_duration_minutes smallint check (usual_duration_minutes between 30 and 480),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, learner_id),
  -- The assigned instructor must belong to the same Business.
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id)
);

create index learner_relationships_learner_idx on public.learner_relationships (learner_id);
create index learner_relationships_instructor_idx on public.learner_relationships (instructor_id);

create trigger learner_relationships_updated_at
  before update on public.learner_relationships
  for each row execute function private.set_updated_at();

-- Private instructor notes (LRN-04). No policy ever grants learners access.
create table public.learner_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references public.users (id) on delete cascade,
  author_id uuid not null references public.users (id),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learner_notes_learner_idx on public.learner_notes (business_id, learner_id);

create trigger learner_notes_updated_at
  before update on public.learner_notes
  for each row execute function private.set_updated_at();

-- Pickup points (COV-04). business_id is null for the learner's own points, which all
-- their Businesses can see, and set for points a Business added for its own use.
create table public.pickup_points (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.users (id) on delete cascade,
  business_id uuid references public.businesses (id) on delete cascade,
  kind public.pickup_kind not null default 'home',
  label text not null check (char_length(label) between 1 and 60),
  address text not null check (char_length(address) between 1 and 200),
  postcode text,
  location extensions.geography(point, 4326),
  is_default boolean not null default false,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pickup_points_learner_idx on public.pickup_points (learner_id);

create trigger pickup_points_updated_at
  before update on public.pickup_points
  for each row execute function private.set_updated_at();

alter table public.postcodes enable row level security;
alter table public.instructor_profiles enable row level security;
alter table public.learner_profiles enable row level security;
alter table public.learner_private enable row level security;
alter table public.learner_relationships enable row level security;
alter table public.learner_notes enable row level security;
alter table public.pickup_points enable row level security;

-- ---------------------------------------------------------------------------------------
-- Helpers for learner and instructor visibility
-- ---------------------------------------------------------------------------------------

-- The caller's instructor profiles in Businesses where their membership is active.
create or replace function private.auth_instructor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ip.id
    from public.instructor_profiles ip
    join public.memberships m on m.business_id = ip.business_id and m.user_id = ip.user_id
   where ip.user_id = (select auth.uid())
     and m.status = 'active';
$$;

-- Learners are visible to themselves, to owners and managers of Businesses they are linked
-- to, to their assigned instructor, and to platform staff with TOTP.
create or replace function private.auth_can_see_learner(p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_learner_id = (select auth.uid())
      or exists (
           select 1 from public.learner_relationships lr
            where lr.learner_id = p_learner_id
              and (
                lr.business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
                or lr.instructor_id in (select private.auth_instructor_ids())
              )
         )
      or private.auth_is_staff();
$$;

-- True when the caller is a learner linked to the Business.
create or replace function private.auth_is_linked_learner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.learner_relationships lr
     where lr.business_id = p_business_id
       and lr.learner_id = (select auth.uid())
  );
$$;

-- Instructors see an age band, never a date of birth (R-16, NFR-PRV-04).
create or replace function private.learner_age_band(p_learner_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.auth_can_see_learner(p_learner_id) then null
    when lp.date_of_birth is null then null
    when lp.date_of_birth > (current_date - interval '18 years')::date then 'under_18'
    else '18_plus'
  end
    from public.learner_private lp
   where lp.user_id = p_learner_id;
$$;

grant execute on function
  private.auth_instructor_ids(),
  private.auth_can_see_learner(uuid),
  private.auth_is_linked_learner(uuid),
  private.learner_age_band(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------------------

-- postcodes: public reference data.
grant select on public.postcodes to anon, authenticated;
create policy postcodes_select_all on public.postcodes for select to anon, authenticated using (true);

-- Learners linked to a Business can see it (name and address on receipts, for example).
create policy businesses_select_linked_learner on public.businesses
  for select to authenticated
  using (private.auth_is_linked_learner(id));

-- Business staff can see the learners they work with.
create policy users_select_visible_learners on public.users
  for select to authenticated
  using (private.auth_can_see_learner(id));

-- instructor_profiles
grant select on public.instructor_profiles to authenticated;
grant update (
  display_name, bio, photo_url, languages, years_teaching, qualification, badge_number, badge_expiry,
  dbs_confirmed_at, transmission, car_make, car_model, dual_controls, specialisms, radius_miles,
  base_postcode, base_location, instant_book, buffer_minutes, public_slug, is_listed,
  supervisor_business_id, supervisor_instructor_id
) on public.instructor_profiles to authenticated;

create policy instructor_profiles_select_members on public.instructor_profiles
  for select to authenticated
  using (business_id in (select private.auth_business_ids()));

create policy instructor_profiles_select_linked_learner on public.instructor_profiles
  for select to authenticated
  using (private.auth_is_linked_learner(business_id));

create policy instructor_profiles_select_staff on public.instructor_profiles
  for select to authenticated
  using ((select private.auth_is_staff()));

create policy instructor_profiles_update_own_or_admin on public.instructor_profiles
  for update to authenticated
  using (id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_members'))
  with check (id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_members'));

-- learner_profiles
grant select on public.learner_profiles to authenticated;
grant insert (user_id, postcode, location, transmission, experience_level, provisional_licence_confirmed)
  on public.learner_profiles to authenticated;
grant update (postcode, location, transmission, experience_level, provisional_licence_confirmed)
  on public.learner_profiles to authenticated;

create policy learner_profiles_select_visible on public.learner_profiles
  for select to authenticated
  using (private.auth_can_see_learner(user_id));

create policy learner_profiles_insert_self on public.learner_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy learner_profiles_update_self on public.learner_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- learner_private: the learner only.
grant select on public.learner_private to authenticated;
grant insert (user_id, date_of_birth, licence_number_encrypted) on public.learner_private to authenticated;
grant update (date_of_birth, licence_number_encrypted) on public.learner_private to authenticated;

create policy learner_private_select_self on public.learner_private
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy learner_private_insert_self on public.learner_private
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy learner_private_update_self on public.learner_private
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- learner_relationships: writes go through RPCs (M2).
grant select on public.learner_relationships to authenticated;

create policy learner_relationships_select_learner on public.learner_relationships
  for select to authenticated
  using (learner_id = (select auth.uid()));

create policy learner_relationships_select_business on public.learner_relationships
  for select to authenticated
  using (
    business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or instructor_id in (select private.auth_instructor_ids())
  );

create policy learner_relationships_select_staff on public.learner_relationships
  for select to authenticated
  using ((select private.auth_is_staff()));

-- learner_notes: owners and managers, the author, and the assigned instructor. Never learners.
grant select, delete on public.learner_notes to authenticated;
grant insert (business_id, learner_id, author_id, body) on public.learner_notes to authenticated;
grant update (body) on public.learner_notes to authenticated;

create or replace function private.auth_can_write_notes(p_business_id uuid, p_learner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.learner_relationships lr
     where lr.business_id = p_business_id
       and lr.learner_id = p_learner_id
       and (
         private.auth_has_role(p_business_id, array['owner', 'manager']::public.membership_role[])
         or lr.instructor_id in (select private.auth_instructor_ids())
       )
  );
$$;

grant execute on function private.auth_can_write_notes(uuid, uuid) to authenticated;

create policy learner_notes_select_business on public.learner_notes
  for select to authenticated
  using (
    learner_id <> (select auth.uid())
    and (author_id = (select auth.uid()) or private.auth_can_write_notes(business_id, learner_id))
  );

create policy learner_notes_insert_business on public.learner_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and learner_id <> (select auth.uid())
    and private.auth_can_write_notes(business_id, learner_id)
  );

create policy learner_notes_update_author on public.learner_notes
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy learner_notes_delete_author on public.learner_notes
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- pickup_points: the learner manages their own; a Business manages the ones it added.
grant select, delete on public.pickup_points to authenticated;
grant insert (learner_id, business_id, kind, label, address, postcode, location, is_default, created_by)
  on public.pickup_points to authenticated;
grant update (kind, label, address, postcode, location, is_default) on public.pickup_points to authenticated;

create policy pickup_points_all_learner on public.pickup_points
  for all to authenticated
  using (learner_id = (select auth.uid()))
  with check (learner_id = (select auth.uid()) and business_id is null);

create policy pickup_points_select_business on public.pickup_points
  for select to authenticated
  using (
    private.auth_can_see_learner(learner_id)
    and (business_id is null or business_id in (select private.auth_business_ids()))
  );

create policy pickup_points_write_business on public.pickup_points
  for all to authenticated
  using (business_id in (select private.auth_business_ids()) and private.auth_can_see_learner(learner_id))
  with check (business_id in (select private.auth_business_ids()) and private.auth_can_see_learner(learner_id));
