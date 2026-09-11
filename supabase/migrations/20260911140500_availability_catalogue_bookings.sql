-- Availability, lesson catalogue and bookings with database-enforced overlap protection
-- (DIA-01, DIA-02, BOK-03, BOK-04, BOK-07, R-01 to R-03, R-05, ARCHITECTURE.md 7.2, D-001, D-002).

create type public.exception_kind as enum ('open', 'blocked');
create type public.lesson_kind as enum ('standard', 'test_prep', 'mock_test', 'motorway', 'intensive', 'test_day', 'custom');
create type public.booking_status as enum (
  'pending_payment', 'requested', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'declined', 'expired'
);
create type public.booking_payment_status as enum (
  'unpaid', 'pending', 'paid_card', 'paid_cash', 'paid_bank', 'paid_credit', 'refunded', 'partially_refunded', 'failed'
);
create type public.booking_payment_mode as enum ('at_booking', 'before_lesson', 'after_lesson', 'credit', 'offline');
create type public.booking_source as enum ('instructor', 'self', 'marketplace', 'gap_fill', 'import');

-- ---------------------------------------------------------------------------------------
-- Weekly working hours (DIA-01), in the Business time zone's wall-clock time.
-- ---------------------------------------------------------------------------------------
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null,
  business_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  minutes_range int4range generated always as (
    int4range(
      (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
      (extract(hour from end_time) * 60 + extract(minute from end_time))::int,
      '[)'
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id) on delete cascade,
  constraint working_hours_no_overlap exclude using gist (instructor_id with =, weekday with =, minutes_range with &&)
);

create trigger working_hours_updated_at
  before update on public.working_hours
  for each row execute function private.set_updated_at();

-- One-off open slots and time off (DIA-02).
create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null,
  business_id uuid not null,
  kind public.exception_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  period tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  reason text check (char_length(reason) <= 200),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id) on delete cascade
);

create index availability_exceptions_period_idx on public.availability_exceptions using gist (instructor_id, period);

create trigger availability_exceptions_updated_at
  before update on public.availability_exceptions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Lesson catalogue (BOK-03, BOK-04, R-05, PAY-04). Money is integer pence.
-- ---------------------------------------------------------------------------------------
create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind public.lesson_kind not null default 'standard',
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 300),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);

create index lesson_types_business_idx on public.lesson_types (business_id);

create trigger lesson_types_updated_at
  before update on public.lesson_types
  for each row execute function private.set_updated_at();

-- Price per lesson type and duration. instructor_id null is the Business default; set it
-- for an instructor's own price where the school allows (SCH-04).
create table public.lesson_prices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  lesson_type_id uuid not null,
  instructor_id uuid,
  duration_minutes smallint not null check (duration_minutes between 30 and 480 and duration_minutes % 15 = 0),
  price_pence integer not null check (price_pence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_type_id, business_id) references public.lesson_types (id, business_id) on delete cascade,
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id) on delete cascade,
  unique nulls not distinct (lesson_type_id, instructor_id, duration_minutes)
);

create index lesson_prices_business_idx on public.lesson_prices (business_id);

create trigger lesson_prices_updated_at
  before update on public.lesson_prices
  for each row execute function private.set_updated_at();

-- Prepaid packages (PAY-04). Credit is held against this Business only (PAY-12).
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  minutes integer not null check (minutes > 0 and minutes <= 6000),
  price_pence integer not null check (price_pence >= 0),
  lesson_type_id uuid,
  expiry_days integer check (expiry_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (lesson_type_id, business_id) references public.lesson_types (id, business_id) on delete set null (lesson_type_id)
);

create index packages_business_idx on public.packages (business_id);

create trigger packages_updated_at
  before update on public.packages
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------------------
-- Bookings. The database, not the app, makes double booking impossible.
--   blocked_range = [starts_at, ends_at + buffer)   instructor, buffered once (D-001)
--   learner_range = [starts_at, ends_at)             learner (R-03)
-- Both are derived by trigger on every write. Blocking statuses per D-002.
-- ---------------------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  instructor_id uuid not null,
  learner_id uuid not null references public.users (id),
  lesson_type_id uuid not null,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  recurrence_id uuid,
  vehicle_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes smallint not null check (buffer_minutes between 0 and 60),
  blocked_range tstzrange not null,
  learner_range tstzrange not null,
  status public.booking_status not null,
  payment_status public.booking_payment_status not null default 'unpaid',
  payment_mode public.booking_payment_mode not null default 'offline',
  price_pence integer not null check (price_pence >= 0),
  credit_minutes integer not null default 0 check (credit_minutes >= 0),
  source public.booking_source not null,
  expires_at timestamptz,
  hold_expires_at timestamptz,
  created_by uuid references public.users (id),
  cancelled_by uuid references public.users (id),
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 500),
  late_cancellation boolean,
  fee_pence integer check (fee_pence >= 0),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '12 hours'),
  check (status <> 'requested' or expires_at is not null),
  check (status <> 'pending_payment' or hold_expires_at is not null),
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id),
  foreign key (lesson_type_id, business_id) references public.lesson_types (id, business_id),
  constraint bookings_no_overlap exclude using gist (instructor_id with =, blocked_range with &&)
    where (status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')),
  constraint bookings_learner_no_overlap exclude using gist (learner_id with =, learner_range with &&)
    where (status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed'))
);

create index bookings_business_starts_idx on public.bookings (business_id, starts_at);
create index bookings_instructor_starts_idx on public.bookings (instructor_id, starts_at);
create index bookings_learner_starts_idx on public.bookings (learner_id, starts_at);

create or replace function private.bookings_set_ranges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ends_at <= new.starts_at then
    raise exception 'A lesson must end after it starts' using errcode = 'check_violation';
  end if;
  new.blocked_range := tstzrange(new.starts_at, new.ends_at + make_interval(mins => new.buffer_minutes), '[)');
  new.learner_range := tstzrange(new.starts_at, new.ends_at, '[)');
  return new;
end;
$$;

create trigger bookings_set_ranges
  before insert or update on public.bookings
  for each row execute function private.bookings_set_ranges();

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

alter table public.working_hours enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.lesson_types enable row level security;
alter table public.lesson_prices enable row level security;
alter table public.packages enable row level security;
alter table public.bookings enable row level security;

-- ---------------------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------------------

-- Availability: members of the Business read it; the instructor, or an owner or manager,
-- changes it. Learners and the public get slots from RPCs, never raw hours.
grant select, delete on public.working_hours, public.availability_exceptions to authenticated;
grant insert (instructor_id, business_id, weekday, start_time, end_time),
      update (weekday, start_time, end_time)
  on public.working_hours to authenticated;
grant insert (instructor_id, business_id, kind, starts_at, ends_at, reason, created_by),
      update (kind, starts_at, ends_at, reason)
  on public.availability_exceptions to authenticated;

create policy working_hours_select_members on public.working_hours
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or (select private.auth_is_staff()));

create policy working_hours_write on public.working_hours
  for all to authenticated
  using (instructor_id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_availability'))
  with check (instructor_id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_availability'));

create policy availability_exceptions_select_members on public.availability_exceptions
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or (select private.auth_is_staff()));

create policy availability_exceptions_write on public.availability_exceptions
  for all to authenticated
  using (instructor_id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_availability'))
  with check (instructor_id in (select private.auth_instructor_ids()) or private.auth_has_permission(business_id, 'manage_availability'));

-- Catalogue: members and linked learners read it; set_prices changes it.
grant select, delete on public.lesson_types, public.lesson_prices, public.packages to authenticated;
grant insert (business_id, kind, name, description, is_active, sort_order),
      update (kind, name, description, is_active, sort_order)
  on public.lesson_types to authenticated;
grant insert (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence),
      update (duration_minutes, price_pence)
  on public.lesson_prices to authenticated;
grant insert (business_id, name, minutes, price_pence, lesson_type_id, expiry_days, is_active),
      update (name, minutes, price_pence, lesson_type_id, expiry_days, is_active)
  on public.packages to authenticated;

create policy lesson_types_select on public.lesson_types
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or private.auth_is_linked_learner(business_id) or (select private.auth_is_staff()));

create policy lesson_types_write on public.lesson_types
  for all to authenticated
  using (private.auth_has_permission(business_id, 'set_prices'))
  with check (private.auth_has_permission(business_id, 'set_prices'));

create policy lesson_prices_select on public.lesson_prices
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or private.auth_is_linked_learner(business_id) or (select private.auth_is_staff()));

create policy lesson_prices_write on public.lesson_prices
  for all to authenticated
  using (private.auth_has_permission(business_id, 'set_prices'))
  with check (private.auth_has_permission(business_id, 'set_prices'));

create policy packages_select on public.packages
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or private.auth_is_linked_learner(business_id) or (select private.auth_is_staff()));

create policy packages_write on public.packages
  for all to authenticated
  using (private.auth_has_permission(business_id, 'set_prices'))
  with check (private.auth_has_permission(business_id, 'set_prices'));

-- Bookings: read-only through the API. Every write goes through booking RPCs (M2).
grant select on public.bookings to authenticated;

create policy bookings_select_business_admins on public.bookings
  for select to authenticated
  using (business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[])));

create policy bookings_select_instructor on public.bookings
  for select to authenticated
  using (instructor_id in (select private.auth_instructor_ids()));

create policy bookings_select_learner on public.bookings
  for select to authenticated
  using (learner_id = (select auth.uid()));

create policy bookings_select_staff on public.bookings
  for select to authenticated
  using ((select private.auth_is_staff()));
