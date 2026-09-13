-- The weekly slot (BOK-05, R-13, M2-19).
--
-- Most learners have one: same time, same day, every week. It is kept as a plan plus the
-- individual bookings it made, never as a rule the diary has to interpret, so a single week
-- can be moved or cancelled like any other lesson.
--
-- The plan holds a local time, not an instant. Nine o'clock on a Tuesday is nine o'clock
-- whatever the clocks did in March (R-14, acceptance-09).

create table public.booking_recurrences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  instructor_id uuid not null,
  learner_id uuid not null references public.users (id) on delete cascade,
  lesson_type_id uuid not null,
  pickup_point_id uuid references public.pickup_points (id) on delete set null,
  /** ISO weekday, Monday 1 to Sunday 7. */
  weekday smallint not null check (weekday between 1 and 7),
  /** Local wall-clock time, in Europe/London. */
  local_time time not null,
  duration_minutes smallint not null check (duration_minutes between 30 and 480),
  starts_on date not null,
  /** Null means it keeps going, and a job keeps booking it (BOK-05). */
  ends_on date,
  booked_until date,
  cancelled_at timestamptz,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id) on delete cascade,
  foreign key (lesson_type_id, business_id) references public.lesson_types (id, business_id),
  check (ends_on is null or ends_on >= starts_on)
);

create index booking_recurrences_instructor_idx on public.booking_recurrences (instructor_id) where cancelled_at is null;
create index booking_recurrences_open_idx on public.booking_recurrences (booked_until) where cancelled_at is null and ends_on is null;

create trigger booking_recurrences_updated_at
  before update on public.booking_recurrences
  for each row execute function private.set_updated_at();

alter table public.booking_recurrences enable row level security;

-- Visible to the same people the bookings it makes are visible to. Writes go through the
-- functions below, so there is no write policy at all.
grant select on public.booking_recurrences to authenticated;

create policy booking_recurrences_select_business on public.booking_recurrences
  for select to authenticated
  using (
    business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or instructor_id in (select private.auth_instructor_ids())
    or learner_id = (select auth.uid())
  );

create policy booking_recurrences_select_staff on public.booking_recurrences
  for select to authenticated
  using ((select private.auth_is_staff()));

-- ---------------------------------------------------------------------------------------
-- book_weekly: the plan, and the lessons it can make.
--
-- Each week is tried on its own. A week that clashes is reported and the rest still go in,
-- because "one of your eight Tuesdays is taken" is not a reason to book none of them (R-13).
-- ---------------------------------------------------------------------------------------
create or replace function public.book_weekly(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_lesson_type_id uuid,
  p_first_starts_at timestamptz,
  p_duration_minutes integer,
  p_weeks integer,
  p_open_ended boolean default false,
  p_pickup_point_id uuid default null
)
returns table (starts_at timestamptz, booking_id uuid, problem text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_local timestamp := p_first_starts_at at time zone 'Europe/London';
  v_date date;
  v_time time := v_local::time;
  v_when timestamptz;
  v_id uuid;
  v_recurrence uuid;
  v_last date;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 52 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "weeks"}';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.booking_recurrences (
    business_id, instructor_id, learner_id, lesson_type_id, pickup_point_id,
    weekday, local_time, duration_minutes, starts_on, ends_on, created_by
  ) values (
    v_business, p_instructor_id, p_learner_id, p_lesson_type_id, p_pickup_point_id,
    extract(isodow from v_local)::smallint, v_time, p_duration_minutes, v_local::date,
    case when p_open_ended then null else (v_local::date + (p_weeks - 1) * 7) end,
    v_user
  )
  returning id into v_recurrence;

  for n in 0 .. p_weeks - 1 loop
    v_date := v_local::date + n * 7;
    -- The local time, every week, whatever the clocks have done since (R-14).
    v_when := (v_date + v_time) at time zone 'Europe/London';
    v_id := null;

    begin
      v_id := public.create_booking(
        p_instructor_id, p_learner_id, p_lesson_type_id, v_when, p_duration_minutes, p_pickup_point_id
      );
      update public.bookings set recurrence_id = v_recurrence where id = v_id;
      v_last := v_date;
      starts_at := v_when;
      booking_id := v_id;
      problem := null;
    exception
      when others then
        starts_at := v_when;
        booking_id := null;
        problem := sqlerrm;
    end;

    return next;
  end loop;

  update public.booking_recurrences set booked_until = v_last where id = v_recurrence;
  perform private.write_audit('booking.repeated', 'booking_recurrence', v_recurrence, v_business, null,
    jsonb_build_object('weeks', p_weeks, 'open_ended', p_open_ended, 'learner_id', p_learner_id));

  return;
end;
$$;

/**
 * Keeps an open-ended weekly slot booked a few weeks ahead (BOK-05). Run daily; a week that
 * clashes is skipped and tried again tomorrow, which is what an instructor would do.
 */
create or replace function public.system_extend_recurrences(p_weeks integer default 4)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.booking_recurrences;
  v_date date;
  v_when timestamptz;
  v_made integer := 0;
  v_horizon date := (now() at time zone 'Europe/London')::date + p_weeks * 7;
begin
  for v_row in
    select * from public.booking_recurrences
     where cancelled_at is null and ends_on is null
  loop
    v_date := coalesce(v_row.booked_until, v_row.starts_on - 7) + 7;
    while v_date <= v_horizon loop
      v_when := (v_date + v_row.local_time) at time zone 'Europe/London';
      if v_when > now() then
        begin
          perform private.book_for_recurrence(v_row, v_when);
          v_made := v_made + 1;
        exception
          when others then null;
        end;
      end if;
      update public.booking_recurrences set booked_until = v_date where id = v_row.id;
      v_date := v_date + 7;
    end loop;
  end loop;

  return v_made;
end;
$$;

/** One lesson of an open-ended weekly slot, written as the person who set it up. */
create or replace function private.book_for_recurrence(p_row public.booking_recurrences, p_when timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_rules jsonb := private.booking_rules(p_row.instructor_id);
  v_price integer;
begin
  if private.slot_problem(p_row.instructor_id, p_when, p_row.duration_minutes, 'instructor', p_row.learner_id, now())
     is not null then
    raise exception 'SLOT_TAKEN' using errcode = '23P01';
  end if;

  select price_pence into v_price
    from public.lesson_prices
   where lesson_type_id = p_row.lesson_type_id
     and business_id = p_row.business_id
     and duration_minutes = p_row.duration_minutes
     and (instructor_id = p_row.instructor_id or instructor_id is null)
   order by instructor_id nulls last
   limit 1;
  if v_price is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
  end if;

  insert into public.bookings (
    business_id, instructor_id, learner_id, lesson_type_id, pickup_point_id, recurrence_id,
    starts_at, ends_at, buffer_minutes, status, price_pence, source, created_by
  ) values (
    p_row.business_id, p_row.instructor_id, p_row.learner_id, p_row.lesson_type_id, p_row.pickup_point_id, p_row.id,
    p_when, p_when + make_interval(mins => p_row.duration_minutes),
    coalesce((v_rules ->> 'buffer_minutes')::int, 30), 'confirmed', v_price, 'instructor', p_row.created_by
  )
  returning id into v_id;

  perform private.enqueue_event('booking.created', jsonb_build_object('booking_id', v_id, 'status', 'confirmed'));
  return v_id;
end;
$$;

/** Stops an open-ended weekly slot. The lessons already booked stay until somebody cancels them. */
create or replace function public.stop_recurrence(p_recurrence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.booking_recurrences;
begin
  select * into v_row from public.booking_recurrences where id = p_recurrence_id;
  if v_row.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_row.instructor_id)
     and not private.auth_has_permission(v_row.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.booking_recurrences set cancelled_at = now() where id = p_recurrence_id;
  perform private.write_audit('booking.repeat_stopped', 'booking_recurrence', p_recurrence_id, v_row.business_id);
end;
$$;

revoke all on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid) from public, anon;
revoke all on function public.stop_recurrence(uuid) from public, anon;
revoke all on function private.book_for_recurrence(public.booking_recurrences, timestamptz) from public, anon, authenticated;
revoke all on function public.system_extend_recurrences(integer) from public, anon, authenticated;
grant execute on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid) to authenticated;
grant execute on function public.stop_recurrence(uuid) to authenticated;
grant execute on function public.system_extend_recurrences(integer) to service_role;
