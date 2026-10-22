-- Somebody who books themselves is on the books from their first lesson that goes ahead (LRN-05, D-208, D-315, D-368).
--
-- Booking on the link made a newcomer active at once, before the lesson was paid for or the
-- instructor had said yes to it. A visitor who chose a time and never paid, or whose request ran
-- out, stayed on the instructor's list as active for good, counted among the learners they teach
-- and, on Free, taking one of its ten places. They now join as an enquiry, as somebody invited
-- does, and the trigger that makes a learner active when a lesson with them is confirmed does the
-- rest (D-315): straight away for a lesson booked outright, on paying for one held, on the
-- instructor saying yes to one asked for. Those already left active by a lesson that never went
-- ahead are put back to enquiry.

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
    -- Somebody new joins as an enquiry, and is on the books from their first lesson that goes
    -- ahead: a time held while they pay, or one they asked for, may never be (D-315, D-368). A
    -- full list on Free still takes nobody new, which the booking link has already said (D-357).
    if not exists (
      select 1 from public.learner_relationships r
       where r.business_id = v_business and r.learner_id = p_learner_id
    ) then
      if not private.learner_room(v_business) then
        raise exception 'LEARNER_LIMIT';
      end if;
      insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, created_by)
      values (v_business, p_learner_id, p_instructor_id, 'enquiry', 'marketplace', v_user)
      on conflict (business_id, learner_id) do nothing;
    end if;
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

-- Learners made active by a booking that never went ahead: every lesson of theirs with the
-- Business ran out, was turned down, or is still waiting to be paid for or answered.
do $$
declare
  v_row public.learner_relationships;
begin
  for v_row in
    select r.* from public.learner_relationships r
     where r.status = 'active'
       and r.source = 'marketplace'
       and not exists (
         select 1 from public.bookings b
          where b.business_id = r.business_id
            and b.learner_id = r.learner_id
            and b.status not in ('expired', 'declined', 'pending_payment', 'requested')
       )
  loop
    update public.learner_relationships set status = 'enquiry', updated_at = now() where id = v_row.id;
    perform private.write_audit(
      'learner.status_changed', 'learner_relationship', v_row.id, v_row.business_id,
      jsonb_build_object('status', 'active'),
      jsonb_build_object('status', 'enquiry', 'because', 'no_lesson_went_ahead')
    );
  end loop;
end;
$$;
