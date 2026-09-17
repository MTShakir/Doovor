-- A limit on how many lessons one account can book an hour (NFR-SEC-03, M6-03, D-137).
--
-- Everything else a signed-in person can start in bulk is already counted: invitations, learners
-- added by hand, and the waiting list and lesson requests. Booking was not. One weekly plan counts
-- once, however many lessons it lays down, because it is one thing the person did.

create or replace function public.create_booking(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_lesson_type_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_pickup_point_id uuid default null
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
  select price_pence into v_price
    from public.lesson_prices
   where lesson_type_id = p_lesson_type_id
     and business_id = v_business
     and duration_minutes = p_duration_minutes
     and (instructor_id = p_instructor_id or instructor_id is null)
   order by instructor_id nulls last
   limit 1;
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

  v_problem := private.slot_problem(p_instructor_id, p_starts_at, p_duration_minutes, v_by, p_learner_id, now());
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  v_rules := private.booking_rules(p_instructor_id);
  v_buffer := coalesce((v_rules ->> 'buffer_minutes')::int, 30);

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
      'paid_with_credit', v_credit,
      'by', v_by
    ));

  perform private.enqueue_event('booking.created', jsonb_build_object('booking_id', v_id, 'status', v_status));

  return v_id;
end;
$$;

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

revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon;
revoke all on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid) to authenticated;
grant execute on function public.book_weekly(uuid, uuid, uuid, timestamptz, integer, integer, boolean, uuid) to authenticated;
