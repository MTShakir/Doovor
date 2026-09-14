-- Lessons paid with credit, and credit given back (PAY-04, R-07, R-08, R-10, R-12, M3-14).
--
-- A lesson uses the learner's credit with its Business first, whenever there is enough for all
-- of it (PAY-04). Part of a lesson from credit and the rest from a card would leave two ways to
-- give money back for one lesson and gain nobody anything, so it is all or nothing, as
-- packages/core/src/credit.ts has it. The minutes are taken from the oldest lots first, in the
-- transaction that makes the booking (R-10), and the lesson is then paid: no card is asked for
-- and no slot is held for one.
--
-- They go back the same way. A lesson called off in time, or by the instructor, returns every
-- minute to the lot it came from (R-07, R-08, acceptance-03). Called off late by the learner, the
-- fee is kept from those same minutes, rounded as `cancellationOutcome` rounds it. A request that
-- is declined or lapses gives them all back, and so does a lesson whose length is changed, which
-- then pays for its new length the way a new booking would.
--
-- Locks come in one order: the diary and the learner first, taken by the booking row's own
-- trigger (20260914200000), then the learner's credit account. So a booking and a cancellation for
-- the same learner at the same moment wait for each other instead of deadlocking.
--
-- create_booking is the function from 20260914170000, book_for_recurrence the one from
-- 20260914170000, cancel_booking the one from 20260913220000, decide_booking_request the one from
-- 20260913200000 and reschedule_booking the one from 20260913230000, each with credit added.

-- ---------------------------------------------------------------------------------------
-- Taking credit, and giving it back.
-- ---------------------------------------------------------------------------------------

/**
 * The minutes a learner can book with at a Business now, with their account locked until the
 * transaction ends so nothing else spends them meanwhile (ARCHITECTURE 7.6). Nothing when they
 * have no account there.
 */
create or replace function private.lock_usable_credit(p_business_id uuid, p_learner_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  select id into v_account_id
    from public.credit_accounts
   where business_id = p_business_id
     and learner_id = p_learner_id
     for update;
  if v_account_id is null then
    return 0;
  end if;

  return coalesce((
    select sum(minutes_remaining)::integer
      from public.credit_lots
     where business_id = p_business_id
       and learner_id = p_learner_id
       and minutes_remaining > 0
       and (expires_at is null or expires_at > now())
  ), 0);
end;
$$;

revoke all on function private.lock_usable_credit(uuid, uuid) from public, anon, authenticated;

/**
 * Pays for a lesson with credit when there is enough for all of it (PAY-04), and says whether it
 * did. The minutes come from the oldest usable lots first. A lesson that was only being held for
 * a card is confirmed, since there is nothing left to pay. Only a lesson that is on and not paid
 * any other way can be paid like this.
 */
create or replace function private.pay_with_credit(p_booking_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_minutes integer;
  v_needed integer;
  v_take integer;
  v_lot record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null
     or v_booking.status not in ('requested', 'pending_payment', 'confirmed')
     or v_booking.payment_status <> 'unpaid' then
    return false;
  end if;

  v_minutes := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::integer;
  if private.lock_usable_credit(v_booking.business_id, v_booking.learner_id) < v_minutes then
    return false;
  end if;

  v_needed := v_minutes;
  for v_lot in
    select id, minutes_remaining
      from public.credit_lots
     where business_id = v_booking.business_id
       and learner_id = v_booking.learner_id
       and minutes_remaining > 0
       and (expires_at is null or expires_at > now())
     order by purchased_at, id
  loop
    exit when v_needed = 0;
    v_take := least(v_lot.minutes_remaining, v_needed);
    insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id)
    values (v_booking.business_id, v_booking.learner_id, v_lot.id, 'use', -v_take, p_booking_id, p_actor_id);
    v_needed := v_needed - v_take;
  end loop;

  update public.bookings
     set status = case when status = 'pending_payment' then 'confirmed'::public.booking_status else status end,
         hold_expires_at = null,
         payment_mode = 'credit',
         payment_status = 'paid_credit',
         credit_minutes = v_minutes
   where id = p_booking_id;

  return true;
end;
$$;

revoke all on function private.pay_with_credit(uuid, uuid) from public, anon, authenticated;

/**
 * Gives back the credit a lesson still holds (R-07, R-08), and says how much went back and how
 * much was kept. Every minute returns to the lot it came from; then `p_fee_percent` of them is
 * kept from the same lots, in the order the lesson used them, as `settleCancelledCredit` does.
 * What is returned is rounded as `cancellationOutcome` rounds it, so the warning somebody read
 * before cancelling is what happens. A lesson holding no credit is left alone.
 */
create or replace function private.give_back_credit(p_booking_id uuid, p_fee_percent integer, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_held record;
  v_lots uuid[] := array[]::uuid[];
  v_amounts integer[] := array[]::integer[];
  v_total integer := 0;
  v_percent integer := least(greatest(coalesce(p_fee_percent, 0), 0), 100);
  v_fee integer;
  v_left integer;
  v_keep integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    return jsonb_build_object('returned', 0, 'kept', 0);
  end if;

  -- What the lesson still holds, lot by lot: used and not yet given back.
  for v_held in
    select m.lot_id, (-sum(m.minutes))::integer as minutes
      from public.credit_ledger m
      join public.credit_lots l on l.id = m.lot_id
     where m.booking_id = p_booking_id
       and m.kind in ('use', 'return')
     group by m.lot_id, l.purchased_at
    having -sum(m.minutes) > 0
     order by l.purchased_at, m.lot_id
  loop
    insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id)
    values (v_booking.business_id, v_booking.learner_id, v_held.lot_id, 'return', v_held.minutes, p_booking_id, p_actor_id);
    v_lots := v_lots || v_held.lot_id;
    v_amounts := v_amounts || v_held.minutes;
    v_total := v_total + v_held.minutes;
  end loop;

  if v_total = 0 then
    return jsonb_build_object('returned', 0, 'kept', 0);
  end if;

  v_fee := v_total - round(v_total * (100 - v_percent) / 100.0)::integer;
  v_left := v_fee;
  for i in 1 .. coalesce(array_length(v_lots, 1), 0) loop
    exit when v_left = 0;
    v_keep := least(v_amounts[i], v_left);
    insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id)
    values (v_booking.business_id, v_booking.learner_id, v_lots[i], 'fee', -v_keep, p_booking_id, p_actor_id);
    v_left := v_left - v_keep;
  end loop;

  return jsonb_build_object('returned', v_total - v_fee, 'kept', v_fee);
end;
$$;

revoke all on function private.give_back_credit(uuid, integer, uuid) from public, anon, authenticated;

/**
 * A request that lapses gives its credit back, whichever of the places that notice it lapsed
 * does the noticing: the sweep, somebody answering too late, or a booking tidying the diary
 * (R-12). Nobody made the move, so it has no actor.
 */
create or replace function private.return_credit_on_expiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (private.give_back_credit(new.id, 0, null) ->> 'returned')::integer > 0 then
    update public.bookings set payment_status = 'refunded' where id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.return_credit_on_expiry() from public, anon, authenticated;

create trigger bookings_return_credit_on_expiry
  after update of status on public.bookings
  for each row
  when (new.status = 'expired' and old.status is distinct from 'expired' and new.payment_status = 'paid_credit')
  execute function private.return_credit_on_expiry();

-- ---------------------------------------------------------------------------------------
-- Booking.
-- ---------------------------------------------------------------------------------------

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

  -- An instructor books for their own learners; a learner booking for the first time joins
  -- the Business as they do it (BOK-02, LRN-03).
  if v_is_instructor then
    if not exists (
      select 1 from public.learner_relationships
       where business_id = v_business and learner_id = p_learner_id
    ) then
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
    starts_at, ends_at, buffer_minutes, status, payment_mode, price_pence, source, created_by
  ) values (
    p_row.business_id, p_row.instructor_id, p_row.learner_id, p_row.lesson_type_id, p_row.pickup_point_id, p_row.id,
    p_when, p_when + make_interval(mins => p_row.duration_minutes),
    coalesce((v_rules ->> 'buffer_minutes')::int, 30), 'confirmed',
    private.new_booking_payment_mode(p_row.business_id), v_price, 'instructor', p_row.created_by
  )
  returning id into v_id;

  -- Each week is a lesson like any other, so it is paid from credit first (PAY-04). The sweep
  -- that books weeks further ahead is nobody, and says so.
  perform private.pay_with_credit(v_id, (select auth.uid()));

  perform private.enqueue_event('booking.created', jsonb_build_object('booking_id', v_id, 'status', 'confirmed'));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Calling a lesson off.
-- ---------------------------------------------------------------------------------------

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_window integer;
  v_percent integer;
  v_by text;
  v_late boolean;
  v_fee integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_credit jsonb := jsonb_build_object('returned', 0, 'kept', 0);
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id) then
    v_by := 'instructor';
  elsif private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    v_by := 'business';
  elsif v_booking.learner_id = v_user then
    v_by := 'learner';
  else
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  -- An instructor calling a lesson off has to say why: the learner is told (R-08).
  if v_by in ('instructor', 'business') and v_reason is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_window := coalesce((v_rules ->> 'cancellation_window_hours')::int, 48);
  v_percent := coalesce((v_rules ->> 'late_fee_percent')::int, 100);
  v_late := v_booking.starts_at - now() < make_interval(hours => v_window);

  -- Nothing is charged when the instructor or the Business is the one calling it off (R-08).
  if v_late and v_by = 'learner' then
    v_fee := round(v_booking.price_pence * greatest(least(v_percent, 100), 0) / 100.0);
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user,
         cancel_reason = v_reason,
         late_cancellation = v_late,
         fee_pence = v_fee,
         version = version + 1
   where id = p_booking_id;

  -- A lesson paid with credit: every minute back, less the fee when the learner cancelled late,
  -- which the credit pays (R-07).
  if v_booking.payment_status = 'paid_credit' then
    v_credit := private.give_back_credit(
      p_booking_id,
      case when v_late and v_by = 'learner' then v_percent else 0 end,
      v_user
    );
    update public.bookings
       set payment_status = case
             when (v_credit ->> 'kept')::integer = 0 then 'refunded'
             when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
             else 'partially_refunded'
           end::public.booking_payment_status
     where id = p_booking_id;
  end if;

  perform private.write_audit('booking.cancelled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'cancelled', 'by', v_by, 'late', v_late, 'fee_pence', v_fee, 'reason', v_reason,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer));
  perform private.enqueue_event('booking.cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'by', v_by, 'late', v_late, 'fee_pence', v_fee,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer));

  return jsonb_build_object('late', v_late, 'fee_pence', v_fee, 'by', v_by,
                            'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                            'credit_kept_minutes', (v_credit ->> 'kept')::integer);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Answering a request.
-- ---------------------------------------------------------------------------------------

create or replace function public.decide_booking_request(
  p_booking_id uuid,
  p_accept boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_status public.booking_status;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A request that has already been answered, or has run out of time, is not one to answer.
  if v_booking.status <> 'requested' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.expires_at is not null and v_booking.expires_at <= now() then
    update public.bookings set status = 'expired' where id = p_booking_id;
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "expires_at"}';
  end if;

  v_status := case when p_accept then 'confirmed' else 'cancelled' end::public.booking_status;

  update public.bookings
     set status = v_status,
         expires_at = null,
         cancelled_at = case when p_accept then null else now() end,
         cancelled_by = case when p_accept then null else v_user end,
         cancel_reason = case when p_accept then null else nullif(btrim(coalesce(p_reason, '')), '') end,
         version = version + 1
   where id = p_booking_id;

  -- A declined request keeps nothing: the credit it was paid with all comes back (R-12).
  if not p_accept and v_booking.payment_status = 'paid_credit'
     and (private.give_back_credit(p_booking_id, 0, v_user) ->> 'returned')::integer > 0 then
    update public.bookings set payment_status = 'refunded' where id = p_booking_id;
  end if;

  perform private.write_audit(
    case when p_accept then 'booking.accepted' else 'booking.declined' end,
    'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', v_status, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );
  perform private.enqueue_event(
    case when p_accept then 'booking.accepted' else 'booking.declined' end,
    jsonb_build_object('booking_id', p_booking_id)
  );

  return v_status::text;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Moving a lesson.
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
  v_was integer;
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

  v_was := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_minutes := coalesce(p_duration_minutes, v_was);

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
    jsonb_build_object('starts_at', v_booking.starts_at),
    jsonb_build_object('starts_at', p_starts_at, 'by', v_by));
  perform private.enqueue_event('booking.rescheduled',
    jsonb_build_object('booking_id', p_booking_id, 'was', v_booking.starts_at, 'now', p_starts_at));

  return p_booking_id;
end;
$$;
