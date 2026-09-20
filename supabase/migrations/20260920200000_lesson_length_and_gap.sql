-- A lesson an instructor can lengthen or shorten, and a gap they can say they do not need
-- (BOK-03, BOK-07, BOK-08, D-187).
--
-- Two things the product owner asked for. An instructor could move a lesson but not change how
-- long it runs, so a one hour lesson that turned into two had to be cancelled and booked again;
-- `reschedule_booking` already took a length, and now prices the new one the way a new booking is
-- priced (R-05, D-179) rather than leaving the old price on a different lesson.
--
-- And the diary keeps a travel gap after every lesson, which is right until the next lesson is at
-- the same address or the instructor is simply staying put. Ticking the box on the booking form
-- says the gap is not needed: the new lesson asks for none of its own, and the instructor's own
-- lesson beside it gives up as much of its gap as this booking needs. Only an instructor may tick
-- it, only their own lessons are touched, never a minute of a lesson itself, and the audit row
-- says the gap was ignored.

drop function if exists private.slot_problem(uuid, timestamptz, integer, text, uuid, timestamptz, uuid);

create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now(),
  p_except_booking_id uuid default null,
  p_ignore_gap boolean default false
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
  -- Ignoring the gap means this lesson asks for no travel time of its own (D-187).
  v_blocked tstzrange := tstzrange(p_starts_at, v_ends_at + make_interval(mins => case when p_ignore_gap then 0 else v_buffer end), '[)');
  v_lesson tstzrange := tstzrange(p_starts_at, v_ends_at, '[)');
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    return 'VALIDATION_FAILED';
  end if;

  -- A suspended Business takes no lessons, from anybody (ADM-02, D-125).
  if exists (
    select 1
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
     where i.id = p_instructor_id
       and b.status = 'suspended'
  ) then
    return 'BUSINESS_SUSPENDED';
  end if;

  -- Somebody switched off at their Business teaches nobody there (SCH-02, D-120).
  if not exists (
    select 1
      from public.instructor_profiles i
      join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
     where i.id = p_instructor_id
  ) then
    return 'INSTRUCTOR_INACTIVE';
  end if;

  if exists (
    select 1 from public.bookings b
     where b.instructor_id = p_instructor_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       -- And that a lesson beside it is judged on when it is taught, not on the travel time
       -- after it, which the booking then gives up on that side as well (D-187).
       and (case when p_ignore_gap then tstzrange(b.starts_at, b.ends_at, '[)') else b.blocked_range end) && v_blocked
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

drop function if exists public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid);

create or replace function public.create_booking(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_lesson_type_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_pickup_point_id uuid default null,
  p_ignore_gap boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_is_instructor boolean;
  v_is_learner boolean := false;
  v_by text;
  v_rules jsonb;
  v_buffer integer;
  v_price integer;
  v_problem text;
  v_status public.booking_status;
  v_expires timestamptz;
  v_hold timestamptz;
  v_mode public.booking_payment_mode;
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_id uuid;
  v_constraint text;
  v_credit boolean;
  v_ignore boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- The terms a lesson is booked on are the Business's terms on the day it is booked (PAY-03).
  v_mode := private.new_booking_payment_mode(v_business);

  -- Who is asking decides which rules apply (R-04) and how the booking starts life.
  v_is_instructor :=
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
    or private.auth_has_permission(v_business, 'manage_bookings');
  if not v_is_instructor then
    v_is_learner := p_learner_id = v_user;
    if not v_is_learner then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
    if not exists (select 1 from public.learner_profiles where user_id = v_user) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;
  v_by := case when v_is_instructor then 'instructor' else 'learner' end;
  -- The gap between lessons is the instructor's own travel time, so only they may say it is
  -- not needed here. A learner asking for it is simply booking as usual (D-187).
  v_ignore := p_ignore_gap and v_is_instructor;

  -- No more than a working day's worth of bookings an hour from one account: a learner books a
  -- handful, and a school books a day's lessons in a sitting, while a script books thousands
  -- (NFR-SEC-03, M6-03, D-137).
  if not private.rate_limit_hit('book:' || v_user::text, interval '1 hour', 120) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  -- An instructor books for their own learners, and somebody who manages bookings for any of the
  -- Business's (PRD 6.2); the lesson shows its instructor who it is with (D-097). A learner
  -- booking for the first time joins the Business as they do it (BOK-02, LRN-03).
  if v_is_instructor then
    if not private.auth_can_book_learner(v_business, p_learner_id) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  else
    insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, created_by)
    values (v_business, p_learner_id, p_instructor_id, 'active', 'marketplace', v_user)
    on conflict (business_id, learner_id) do nothing;
  end if;

  -- The price comes from the catalogue, never from the caller (R-05).
  -- A length the catalogue does not hold is priced at the hourly rate for the time it takes (D-179).
  v_price := private.lesson_price_for(v_business, p_lesson_type_id, p_instructor_id, p_duration_minutes);
  if v_price is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
  end if;

  -- A request nobody answered stops holding the slot the moment it lapses (R-12). The rows
  -- are locked in one order and any already being expired elsewhere are left alone, so two
  -- people booking at the same moment cannot deadlock over the tidying up.
  update public.bookings
     set status = 'expired'
   where id in (
     select id from public.bookings
      where instructor_id = p_instructor_id
        and status = 'requested'
        and expires_at <= now()
      order by id
      for update skip locked
   );

  v_problem := private.slot_problem(p_instructor_id, p_starts_at, p_duration_minutes, v_by, p_learner_id, now(), null, v_ignore);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  v_rules := private.booking_rules(p_instructor_id);
  v_buffer := case when v_ignore then 0 else coalesce((v_rules ->> 'buffer_minutes')::int, 30) end;

  -- Back to back takes both sides: the lesson before still holds its own travel time, and the
  -- diary refuses anything inside it. Their own lessons give up as much of that time as this
  -- booking needs, never more, and never a minute of the lesson itself (D-187).
  if v_ignore then
    update public.bookings b
       set buffer_minutes = greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int)
     where b.instructor_id = p_instructor_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && tstzrange(p_starts_at, v_ends_at, '[)')
       and not (tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)'))
       and b.buffer_minutes > greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int);
  end if;

  -- An instructor's own booking is confirmed. A learner's is confirmed too when the
  -- instructor takes bookings instantly, and otherwise waits for them (BOK-06, R-12).
  if v_is_instructor or coalesce((select instant_book from public.instructor_profiles where id = p_instructor_id), true) then
    v_status := 'confirmed';
  else
    v_status := 'requested';
    v_expires := least(
      now() + make_interval(hours => coalesce((v_rules ->> 'request_expiry_hours')::int, 12)),
      p_starts_at - interval '2 hours'
    );
  end if;

  -- A Business that takes its money at booking holds the slot while the learner pays (PAY-03,
  -- R-10). An instructor booking for one of their learners is not sitting at a card, and a
  -- request has nothing to pay for until it is accepted (M3-08), so neither is held.
  if v_status = 'confirmed' and not v_is_instructor and private.payment_mode(v_business) = 'at_booking' then
    v_status := 'pending_payment';
    v_mode := 'at_booking';
    v_hold := now() + interval '15 minutes';
  end if;

  begin
    insert into public.bookings (
      business_id, instructor_id, learner_id, lesson_type_id, pickup_point_id,
      starts_at, ends_at, buffer_minutes, status, payment_mode, price_pence, source,
      expires_at, hold_expires_at, created_by
    ) values (
      v_business, p_instructor_id, p_learner_id, p_lesson_type_id, p_pickup_point_id,
      p_starts_at, v_ends_at, v_buffer, v_status, v_mode, v_price,
      case when v_is_instructor then 'instructor' else 'self' end::public.booking_source,
      v_expires, v_hold, v_user
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      -- Two people took the same slot at once. Which one lost says what to tell them (R-02, R-03).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bookings_learner_no_overlap' then
        raise exception 'LEARNER_BUSY' using errcode = '23P01';
      end if;
      raise exception 'SLOT_TAKEN' using errcode = '23P01';
  end;

  -- Credit first (PAY-04), in this transaction (R-10). A lesson held for a card is confirmed
  -- instead, since there is nothing left to pay.
  v_credit := private.pay_with_credit(v_id, v_user);
  if v_credit then
    select status into v_status from public.bookings where id = v_id;
  end if;

  perform private.write_audit('booking.created', 'booking', v_id, v_business, null,
    jsonb_build_object(
      'instructor_profile_id', p_instructor_id,
      'learner_id', p_learner_id,
      'starts_at', p_starts_at,
      'duration_minutes', p_duration_minutes,
      'status', v_status,
      'price_pence', v_price,
      'ignored_gap', v_ignore,
      'paid_with_credit', v_credit,
      'by', v_by
    ));

  perform private.enqueue_event('booking.created', jsonb_build_object('booking_id', v_id, 'status', v_status));

  return v_id;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid, boolean) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid, boolean) to authenticated;

drop function if exists public.reschedule_booking(uuid, timestamptz, integer);

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default null,
  p_ignore_gap boolean default false
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
  v_was integer;
  v_problem text;
  v_price integer;
  v_ignore boolean := false;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Only the instructor, or somebody who manages the Business's bookings, moves a lesson. A
  -- learner asks them (BOK-08 as amended, D-164).
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_by := 'instructor';
  -- Whoever may move a lesson may also say its travel gap is not needed here (D-187).
  v_ignore := p_ignore_gap;

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  v_was := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_minutes := coalesce(p_duration_minutes, v_was);

  -- A different length is a different lesson to sell, so it is priced the way a new booking of
  -- that length is priced: the catalogue, or the hourly rate for a length it does not hold
  -- (R-05, D-179, D-187). A lesson already paid for in money is not repriced behind the
  -- learner's back; the money has to be sorted out before its length changes.
  if v_minutes <> v_was then
    if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'refunded', 'partially_refunded') then
      raise exception 'ALREADY_PAID' using errcode = 'P0001';
    end if;
    v_price := private.lesson_price_for(v_booking.business_id, v_booking.lesson_type_id, v_booking.instructor_id, v_minutes);
    if v_price is null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
    end if;
  end if;

  v_problem := private.slot_problem(
    v_booking.instructor_id, p_starts_at, v_minutes, v_by, v_booking.learner_id, now(), p_booking_id, v_ignore
  );
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  -- Their own lessons beside it give up as much of their travel time as this one needs (D-187).
  if v_ignore then
    update public.bookings b
       set buffer_minutes = greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int)
     where b.instructor_id = v_booking.instructor_id
       and b.id <> p_booking_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_minutes), '[)')
       and not (tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_minutes), '[)'))
       and b.buffer_minutes > greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int);
  end if;

  update public.bookings
     set starts_at = p_starts_at,
         ends_at = p_starts_at + make_interval(mins => v_minutes),
         price_pence = coalesce(v_price, price_pence),
         buffer_minutes = case when v_ignore then 0 else buffer_minutes end,
         version = version + 1
   where id = p_booking_id;

  -- A lesson paid with credit that is now a different length gives its credit back and pays
  -- for the new length the way a new booking would: from credit if there is enough, and
  -- otherwise on the Business's terms (PAY-04).
  if v_booking.payment_status = 'paid_credit' and v_minutes <> v_was then
    perform private.give_back_credit(p_booking_id, 0, v_user);
    update public.bookings
       set payment_status = 'unpaid',
           payment_mode = private.new_booking_payment_mode(v_booking.business_id),
           credit_minutes = 0
     where id = p_booking_id;
    perform private.pay_with_credit(p_booking_id, v_user);
  end if;

  perform private.write_audit('booking.rescheduled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('starts_at', v_booking.starts_at, 'minutes', v_was, 'price_pence', v_booking.price_pence),
    jsonb_build_object('starts_at', p_starts_at, 'minutes', v_minutes, 'price_pence', coalesce(v_price, v_booking.price_pence),
                       'by', v_by, 'ignored_gap', v_ignore));
  perform private.enqueue_event('booking.rescheduled',
    jsonb_build_object('booking_id', p_booking_id, 'was', v_booking.starts_at, 'now', p_starts_at));

  return p_booking_id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz, integer, boolean) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz, integer, boolean) to authenticated;

drop function if exists public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid);

create or replace function public.book_weekly(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_lesson_type_id uuid,
  p_first_starts_at timestamptz,
  p_duration_minutes integer,
  p_weeks integer,
  p_open_ended boolean default false,
  p_pickup_point_id uuid default null,
  p_ignore_gap boolean default false
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
  -- The sweep books an open-ended plan with nobody asking, so whether the learner is the caller's
  -- to book is settled before the plan is written, not week by week (PRD 6.2, D-097).

  -- No more than a working day's worth of bookings an hour from one account: a learner books a
  -- handful, and a school books a day's lessons in a sitting, while a script books thousands
  -- (NFR-SEC-03, M6-03, D-137).
  if not private.rate_limit_hit('book:' || v_user::text, interval '1 hour', 120) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  if not private.auth_can_book_learner(v_business, p_learner_id) then
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
      -- Every week the same way, gap and all: a tick that held for the first lesson but not
      -- the rest would leave a fortnightly surprise in the diary (D-187).
      v_id := public.create_booking(
        p_instructor_id, p_learner_id, p_lesson_type_id, v_when, p_duration_minutes, p_pickup_point_id, p_ignore_gap
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

revoke all on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid, boolean) from public, anon;
grant execute on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- What a lesson would cost at another length, so the screen can say so before it is changed
-- (R-05, D-187). The price is still the database's to work out; this only asks it early.
-- ---------------------------------------------------------------------------------------
create or replace function public.price_for_booking_length(p_booking_id uuid, p_duration_minutes integer)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Whoever may change the length may ask what it would cost, and nobody else.
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return private.lesson_price_for(v_booking.business_id, v_booking.lesson_type_id, v_booking.instructor_id, p_duration_minutes);
end;
$$;

comment on function public.price_for_booking_length(uuid, integer) is
  'What this lesson would cost if it ran for this long (R-05, D-187). Null where the Business sells no such length.';

revoke all on function public.price_for_booking_length(uuid, integer) from public, anon;
grant execute on function public.price_for_booking_length(uuid, integer) to authenticated;
