-- Moving a lesson (BOK-08, M2-23).
--
-- A lesson being moved must not be counted as being in its own way, so the slot check learns
-- to leave one booking out of the diary while it looks.

drop function if exists private.slot_problem(uuid, timestamptz, integer, text, uuid, timestamptz);

create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now(),
  p_except_booking_id uuid default null
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
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
  ) then
    return 'SLOT_TAKEN';
  end if;

  if p_learner_id is not null and exists (
    select 1 from public.bookings b
     where b.learner_id = p_learner_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.learner_range && v_lesson
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
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

-- ---------------------------------------------------------------------------------------
-- reschedule_booking: the same lesson, at another time (BOK-08).
--
-- An instructor may move a lesson whenever they like, as long as the new time is free. A
-- learner may move their own until the free cancellation window closes; after that, moving
-- it is a late cancellation in disguise, so they are told to ring rather than charged (R-06).
-- ---------------------------------------------------------------------------------------
create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_by text;
  v_minutes integer;
  v_rules jsonb;
  v_window integer;
  v_problem text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     or private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    v_by := 'instructor';
  elsif v_booking.learner_id = v_user then
    v_by := 'learner';
  else
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  v_minutes := coalesce(
    p_duration_minutes,
    (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int
  );

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_window := coalesce((v_rules ->> 'cancellation_window_hours')::int, 48);

  -- Inside the window, moving a lesson is the learner asking somebody to take the cost of a
  -- late change; that is a conversation, not a button (R-06, BOK-08).
  if v_by = 'learner' and v_booking.starts_at - now() < make_interval(hours => v_window) then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
  end if;

  v_problem := private.slot_problem(
    v_booking.instructor_id, p_starts_at, v_minutes, v_by, v_booking.learner_id, now(), p_booking_id
  );
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  update public.bookings
     set starts_at = p_starts_at,
         ends_at = p_starts_at + make_interval(mins => v_minutes),
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('booking.rescheduled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('starts_at', v_booking.starts_at),
    jsonb_build_object('starts_at', p_starts_at, 'by', v_by));
  perform private.enqueue_event('booking.rescheduled',
    jsonb_build_object('booking_id', p_booking_id, 'was', v_booking.starts_at, 'now', p_starts_at));

  return p_booking_id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz, integer) from public, anon;
revoke all on function private.slot_problem(uuid, timestamptz, integer, text, uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz, integer) to authenticated;
