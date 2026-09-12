-- The booking rules, in the database as well as in TypeScript (R-01 to R-04, M2-13).
--
-- The app works out which slots to offer; this decides whether one may be taken. The two
-- have to agree, so the same vectors are run against both (supabase/tests/31, and
-- packages/core/src/vectors.test.ts).

-- ---------------------------------------------------------------------------------------
-- The rules that apply to one instructor: platform, then Business, then their own two.
-- ---------------------------------------------------------------------------------------
create or replace function private.booking_rules(p_instructor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value from public.platform_settings where key = 'booking_defaults'), '{}'::jsonb)
         || coalesce((select b.settings from public.businesses b
                        join public.instructor_profiles i on i.business_id = b.id
                       where i.id = p_instructor_id), '{}'::jsonb)
         || jsonb_build_object(
              'buffer_minutes',
              coalesce((select i.buffer_minutes from public.instructor_profiles i where i.id = p_instructor_id), 30)
            );
$$;

-- ---------------------------------------------------------------------------------------
-- is_open: does this stretch of time sit inside the instructor's availability (R-04)?
--
-- Working hours are a weekly pattern in local wall-clock time; exceptions are instants.
-- Postgres ranges do the arithmetic: everything open, minus everything blocked out.
-- ---------------------------------------------------------------------------------------
create or replace function private.is_open(p_instructor_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with days as (
    select generate_series(
             (p_starts_at at time zone 'Europe/London')::date - 1,
             (p_ends_at at time zone 'Europe/London')::date + 1,
             interval '1 day'
           )::date as day
  ),
  open_ranges as (
    select tstzrange(
             (d.day + w.start_time) at time zone 'Europe/London',
             (d.day + w.end_time) at time zone 'Europe/London',
             '[)'
           ) as period
      from days d
      join public.working_hours w
        on w.instructor_id = p_instructor_id
       and w.weekday = extract(isodow from d.day)
    union all
    select e.period
      from public.availability_exceptions e
     where e.instructor_id = p_instructor_id
       and e.kind = 'open'
  ),
  blocked as (
    select e.period
      from public.availability_exceptions e
     where e.instructor_id = p_instructor_id
       and e.kind = 'blocked'
  )
  select coalesce(
           coalesce((select range_agg(period) from open_ranges), '{}'::tstzmultirange)
             - coalesce((select range_agg(period) from blocked), '{}'::tstzmultirange),
           '{}'::tstzmultirange
         ) @> tstzrange(p_starts_at, p_ends_at, '[)');
$$;

-- ---------------------------------------------------------------------------------------
-- slot_problem: why this lesson cannot be booked, or null when it can.
--
-- The same order, and the same words, as packages/core/src/slots.ts. `p_now` exists so the
-- vectors can be run at a fixed moment; nothing reachable from the API may pass it.
-- ---------------------------------------------------------------------------------------
create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := private.booking_rules(p_instructor_id);
  v_buffer integer := coalesce((v_rules ->> 'buffer_minutes')::int, 30);
  v_notice integer := coalesce((v_rules ->> 'notice_hours')::int, 24);
  v_horizon integer := coalesce((v_rules ->> 'horizon_weeks')::int, 8);
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_blocked tstzrange := tstzrange(p_starts_at, v_ends_at + make_interval(mins => v_buffer), '[)');
  v_lesson tstzrange := tstzrange(p_starts_at, v_ends_at, '[)');
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    return 'VALIDATION_FAILED';
  end if;

  if exists (
    select 1 from public.bookings b
     where b.instructor_id = p_instructor_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && v_blocked
  ) then
    return 'SLOT_TAKEN';
  end if;

  if p_learner_id is not null and exists (
    select 1 from public.bookings b
     where b.learner_id = p_learner_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.learner_range && v_lesson
  ) then
    return 'LEARNER_BUSY';
  end if;

  -- An instructor books what they like in their own diary, as long as it is free (R-04).
  if p_by = 'instructor' then
    return null;
  end if;

  if p_starts_at < p_now + make_interval(hours => v_notice) then
    return 'NOTICE_TOO_SHORT';
  end if;
  if p_starts_at > p_now + make_interval(weeks => v_horizon) then
    return 'BEYOND_HORIZON';
  end if;
  if not private.is_open(p_instructor_id, p_starts_at, v_ends_at) then
    return 'OUTSIDE_AVAILABILITY';
  end if;

  return null;
end;
$$;

/**
 * What the booking screens ask before they offer a slot. Always about this moment, and
 * always in the caller's own right: whether the rules for a learner or for an instructor
 * apply is decided here, not asked for.
 */
create or replace function public.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.slot_problem(
    p_instructor_id,
    p_starts_at,
    p_duration_minutes,
    case
      when exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
        or private.auth_has_permission(
             (select business_id from public.instructor_profiles where id = p_instructor_id), 'manage_bookings')
      then 'instructor'
      else 'learner'
    end,
    (select auth.uid()),
    now()
  );
$$;

revoke all on function private.slot_problem(uuid, timestamptz, integer, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.is_open(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function private.booking_rules(uuid) from public, anon, authenticated;
revoke all on function public.slot_problem(uuid, timestamptz, integer) from public;
grant execute on function public.slot_problem(uuid, timestamptz, integer) to anon, authenticated;
