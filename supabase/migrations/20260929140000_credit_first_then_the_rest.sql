-- Credit pays for what it can, and the rest is paid the way anything else is (PAY-04, D-225).
--
-- Credit was all or nothing. `pay_with_credit` looked at the balance, and if there was not enough
-- for the whole lesson it did nothing at all, so an hour of credit sitting against a two hour
-- lesson bought nothing and the learner paid for both hours. The product owner asked for the
-- obvious thing: use the hour, charge the hour.
--
-- What changes:
--   * `pay_with_credit` takes whatever is usable, up to the length of the lesson, and records it
--     in `credit_minutes`. It still returns whether credit covered the whole lesson, because that
--     is what its eight callers ask it.
--   * A lesson part paid by credit stays unpaid for money, and what is owed is the price less what
--     the minutes were worth. `private.booking_owed_pence` is the one place that works it out, so
--     the amount on the card, the amount written against cash, the owed list and the receipt
--     cannot disagree.
--   * Money is taken for the remainder rather than the price.
--
-- The minutes are worth their share of the price, rounded down, so credit is never worth more than
-- its share and the pennies of a price that will not divide go to the part being paid in money.
-- `packages/core/src/credit.ts` holds the same rule as `splitByCredit`, with the tests that prove
-- no penny is made or lost at any split.
--
-- A lesson that costs nothing takes no credit: giving somebody a free lesson and quietly spending
-- their minutes on it would be taking something for nothing.

-- ---------------------------------------------------------------------------------------
-- What a lesson still owes in money, after whatever credit has covered.
-- ---------------------------------------------------------------------------------------
create or replace function private.credit_value_pence(p_price_pence integer, p_minutes integer, p_credit_minutes integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_minutes, 0) <= 0 or coalesce(p_price_pence, 0) <= 0 or coalesce(p_credit_minutes, 0) <= 0 then 0
    -- Rounded down, and never more than the price: the same direction `refundValuePence` rounds.
    else least(p_price_pence, (p_price_pence::bigint * least(p_credit_minutes, p_minutes) / p_minutes)::integer)
  end;
$$;

comment on function private.credit_value_pence(integer, integer, integer) is
  'What credit minutes are worth against a lesson price, rounded down (PAY-04, D-225).';

create or replace function private.booking_owed_pence(p_booking public.bookings)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    p_booking.price_pence - private.credit_value_pence(
      p_booking.price_pence,
      (extract(epoch from (p_booking.ends_at - p_booking.starts_at)) / 60)::integer,
      p_booking.credit_minutes
    )
  );
$$;

comment on function private.booking_owed_pence(public.bookings) is
  'What a lesson still owes in money, after whatever credit has covered (PAY-04, D-225).';

grant execute on function private.credit_value_pence(integer, integer, integer) to authenticated;
grant execute on function private.booking_owed_pence(public.bookings) to authenticated;

-- ---------------------------------------------------------------------------------------
-- pay_with_credit: take what is there, not all or nothing.
-- ---------------------------------------------------------------------------------------
create or replace function private.pay_with_credit(p_booking_id uuid, p_actor_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_minutes integer;
  v_available integer;
  v_using integer;
  v_needed integer;
  v_take integer;
  v_lot record;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null
     or v_booking.status not in ('requested', 'pending_payment', 'confirmed')
     or v_booking.payment_status <> 'unpaid'
     or v_booking.credit_minutes > 0 then
    return false;
  end if;

  -- Nothing to pay means nothing to spend. A free lesson leaves the minutes alone.
  if v_booking.price_pence <= 0 then
    return false;
  end if;

  v_minutes := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::integer;
  v_available := private.lock_usable_credit(v_booking.business_id, v_booking.learner_id);
  v_using := least(v_available, v_minutes);
  if v_using <= 0 then
    return false;
  end if;

  v_needed := v_using;
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

  if v_using >= v_minutes then
    -- Covered in full, which is what this did before and what it still returns true for. A lesson
    -- held for a card is confirmed, since there is nothing left to pay.
    update public.bookings
       set status = case when status = 'pending_payment' then 'confirmed'::public.booking_status else status end,
           hold_expires_at = null,
           payment_mode = 'credit',
           payment_status = 'paid_credit',
           credit_minutes = v_minutes
     where id = p_booking_id;
    return true;
  end if;

  -- Part paid. The minutes are spent and the rest is owed in money, so the lesson stays unpaid and
  -- whatever was going to take the money still takes it, for less.
  update public.bookings
     set credit_minutes = v_using
   where id = p_booking_id;
  return false;
end;
$$;

revoke all on function private.pay_with_credit(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Money is taken for what is owed, not for the price.
-- ---------------------------------------------------------------------------------------
create or replace function public.record_offline_payment(p_booking_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_fee_owed boolean;
  v_amount integer;
  v_payment_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash', 'bank') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "method"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A lesson that is on, or has happened, and is not paid for any other way; or one called off
  -- late, or nobody came to, whose fee is still owed. A request is not a lesson yet.
  v_fee_owed := v_booking.status in ('cancelled', 'no_show') and coalesce(v_booking.fee_pence, 0) > 0;
  if v_booking.status not in ('pending_payment', 'confirmed', 'in_progress', 'completed') and not v_fee_owed then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status not in ('unpaid', 'pending', 'failed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment"}';
  end if;
  -- A fee is a fee and is owed whole. A lesson is what is left after credit (D-225).
  v_amount := case when v_fee_owed then v_booking.fee_pence else private.booking_owed_pence(v_booking) end;
  if v_amount <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider, amount_pence,
                               method, status, paid_at)
  values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, 'offline',
          v_amount, p_method::public.payment_method, 'paid', now())
  returning id into v_payment_id;

  -- Paid is paid: a slot held while a card was being found needs holding no longer.
  update public.bookings
     set status = case when status = 'pending_payment' then 'confirmed'::public.booking_status else status end,
         hold_expires_at = null,
         payment_status = case when p_method = 'cash' then 'paid_cash' else 'paid_bank' end::public.booking_payment_status,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('payment.recorded', 'payment', v_payment_id, v_booking.business_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'method', p_method, 'amount_pence', v_amount, 'fee', v_fee_owed,
                       'credit_minutes', v_booking.credit_minutes));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return v_payment_id;
end;
$$;

revoke all on function public.record_offline_payment(uuid, text) from public, anon;
grant execute on function public.record_offline_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Giving credit back no longer asks whether the lesson was paid by credit alone.
--
-- Every one of these asked `payment_status = 'paid_credit'` to decide whether a lesson had credit
-- to hand back. A lesson part paid by credit is `unpaid`, or paid by cash or card, and holds
-- minutes all the same, so each of them would have dropped the learner's credit on the floor.
-- They ask `credit_minutes > 0` instead, which is what the question was always about.
--
-- `give_back_credit` reads the ledger rather than the status and returns nothing when there is
-- nothing, so this is a no-op for every lesson that holds no credit.
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
  v_money jsonb;
  v_charging boolean;
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
  -- Only a lesson that is on can be cancelled late. A request nobody has accepted, or a slot held
  -- while a card is found, costs nothing to let go, however close it is: now that a fee nobody
  -- paid is owed (PAY-06), recording one here would bill a learner for a lesson they never had.
  v_late := v_booking.status in ('confirmed', 'in_progress')
            and v_booking.starts_at - now() < make_interval(hours => v_window);

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

  -- Whatever credit the lesson holds comes back, less the fee when the learner cancelled late,
  -- which the credit pays (R-07). A lesson part paid by credit holds minutes too, and its money
  -- status is unpaid or paid by some other means, so the status below is not its to set (D-225).
  if v_booking.credit_minutes > 0 then
    v_credit := private.give_back_credit(
      p_booking_id,
      case when v_late and v_by = 'learner' then v_percent else 0 end,
      v_user
    );
    if v_booking.payment_status = 'paid_credit' then
      update public.bookings
         set payment_status = case
               when (v_credit ->> 'kept')::integer = 0 then 'refunded'
               when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
               else 'partially_refunded'
             end::public.booking_payment_status
       where id = p_booking_id;
    end if;
  end if;

  -- Money paid for it: whatever the fee does not keep goes back (R-06, R-08, PAY-09).
  v_money := private.settle_cancelled_payments(
    p_booking_id,
    v_fee,
    v_user,
    case
      when v_by = 'learner' and v_fee > 0 then 'Cancelled late: the rest of the payment after the fee'
      when v_by = 'learner' then 'Cancelled in time'
      else left('Cancelled by the instructor: ' || v_reason, 500)
    end
  );

  -- A fee nothing has paid goes to the card the learner keeps with the Business (PAY-09).
  v_charging := private.ask_for_fee(p_booking_id);

  perform private.write_audit('booking.cancelled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'cancelled', 'by', v_by, 'late', v_late, 'fee_pence', v_fee, 'reason', v_reason,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer)
      || v_money);
  perform private.enqueue_event('booking.cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'by', v_by, 'late', v_late, 'fee_pence', v_fee,
                       'window_hours', v_window, 'fee_percent', v_percent,
                       -- Below zero for a lesson already under way.
                       'minutes_before', floor(extract(epoch from v_booking.starts_at - now()) / 60)::integer,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                       'charging', v_charging)
      || v_money);

  return jsonb_build_object('late', v_late, 'fee_pence', v_fee, 'by', v_by,
                            'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                            'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                            'charging', v_charging)
         || v_money;
end;
$$;

create or replace function public.mark_no_show(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_percent integer;
  v_fee integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute_until timestamptz := now() + interval '7 days';
  v_credit jsonb := jsonb_build_object('returned', 0, 'kept', 0);
  v_money jsonb;
  v_charging boolean;
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
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if now() < v_booking.starts_at + interval '15 minutes' then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_percent := least(greatest(coalesce((v_rules ->> 'late_fee_percent')::int, 100), 0), 100);
  v_fee := round(v_booking.price_pence * v_percent / 100.0);

  update public.bookings
     set status = 'no_show',
         late_cancellation = true,
         fee_pence = v_fee,
         cancel_reason = v_reason,
         dispute_until = v_dispute_until,
         version = version + 1
   where id = p_booking_id;

  -- Credit pays the fee first, and what the fee does not keep comes back (R-07).
  -- Whatever credit the lesson holds comes back, less the fee the credit pays (R-09). A lesson
  -- part paid by credit holds minutes too, and its money status is settled below (D-225).
  if v_booking.credit_minutes > 0 then
    v_credit := private.give_back_credit(p_booking_id, v_percent, v_user);
    if v_booking.payment_status = 'paid_credit' then
      update public.bookings
         set payment_status = case
               when (v_credit ->> 'kept')::integer = 0 then 'refunded'
               when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
               else 'partially_refunded'
             end::public.booking_payment_status
       where id = p_booking_id;
    end if;
  end if;

  -- Then money already paid, and whatever the fee does not keep goes back (PAY-09).
  v_money := private.settle_cancelled_payments(p_booking_id, v_fee, v_user, 'No-show: the rest of the payment after the fee');

  -- A fee nothing has paid goes to the card the learner keeps with the Business (PAY-09).
  v_charging := private.ask_for_fee(p_booking_id);

  perform private.write_audit('booking.no_show', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'no_show', 'fee_pence', v_fee, 'reason', v_reason, 'dispute_until', v_dispute_until,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                       'charging', v_charging)
      || v_money);
  perform private.enqueue_event('booking.no_show',
    jsonb_build_object('booking_id', p_booking_id, 'fee_pence', v_fee, 'fee_percent', v_percent,
                       'dispute_until', v_dispute_until,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                       'charging', v_charging)
      || v_money);

  return jsonb_build_object('fee_pence', v_fee, 'dispute_until', v_dispute_until,
                            'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                            'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                            'charging', v_charging)
         || v_money;
end;
$$;

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

  -- A lesson being taught can still be lengthened, which is when an instructor usually decides
  -- to (D-190). One that is over, called off or never answered cannot.
  if v_booking.status not in ('requested', 'pending_payment', 'confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  v_was := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_minutes := coalesce(p_duration_minutes, v_was);

  -- A different length is a different lesson to sell, so it is priced the way a new booking of
  -- that length is priced: the catalogue, or the hourly rate for a length it does not hold
  -- (R-05, D-179, D-187).
  if v_minutes <> v_was then
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

  -- A lesson that is now a different length starts its money again (PAY-04, PAY-09, D-188):
  -- what was paid for the old length goes back exactly as calling the lesson off would give it
  -- back, with no fee, and the new length is then paid for the way a new booking is. Credit goes
  -- straight back on; a card refund goes through the refund job; cash and bank are written down
  -- as owed back, to be handed over on the learner's card.
  if v_minutes <> v_was then
    -- Whatever credit it holds comes back, whether that was the whole lesson or part of it, and
    -- money is settled on its own, because a part paid lesson has both (D-225).
    if v_booking.credit_minutes > 0 then
      perform private.give_back_credit(p_booking_id, 0, v_user);
    end if;
    if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'partially_refunded') then
      perform private.settle_cancelled_payments(
        p_booking_id, 0, v_user,
        format('The lesson went from %s to %s minutes, so what was paid for it goes back', v_was, v_minutes)
      );
    end if;

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

-- ---------------------------------------------------------------------------------------
-- The balance says how much of a lesson credit covered, so what is owed is the rest.
--
-- `amountOwedPence` in packages/core works it out, the same way `private.booking_owed_pence`
-- does in here; this hands it the fact it needs (D-225).
--
-- Taken from the newest definition, which `scripts/latest-function.mjs` finds. Rebuilding one of
-- these from an older copy throws away everything added in between, which is how this migration
-- first dropped the fee handling out of `record_offline_payment`.
-- ---------------------------------------------------------------------------------------
create or replace function public.learner_balance(p_business_id uuid, p_learner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not (
    p_learner_id = v_user
    or p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = p_business_id
         and taught.learner_id = p_learner_id
    )
    or private.auth_is_staff()
  ) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'credit_minutes', coalesce((
      select sum(l.minutes_remaining)::integer
        from public.credit_lots l
       where l.business_id = p_business_id
         and l.learner_id = p_learner_id
         and l.minutes_remaining > 0
         and (l.expires_at is null or l.expires_at > now())
    ), 0),

    -- Lessons that could be owed for, and lessons called off late or nobody came to whose fee
    -- nobody has paid.
    -- Which of them are owed, and since when, is decided in core.
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'status', b.status,
               'payment_status', b.payment_status,
               'payment_mode', b.payment_mode,
               'price_pence', b.price_pence,
               -- What credit already covered of it, so what is owed is the rest (D-225).
               'credit_minutes', b.credit_minutes,
               'fee_pence', coalesce(b.fee_pence, 0),
               'cancelled_at', b.cancelled_at,
               'instructor_id', b.instructor_id,
               'instructor_name', i.display_name
             ) order by b.starts_at)
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
       where b.business_id = p_business_id
         and b.learner_id = p_learner_id
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0)
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- What is on its way back or owed back already, so nobody is offered a refund of nothing.
          select p.id, coalesce(p.paid_at, p.created_at) as at, p.amount_pence, p.method, p.refunded_pence,
                 (select coalesce(sum(r.amount_pence), 0)::integer
                    from public.refunds r
                   where r.payment_id = p.id and r.status = 'pending') as pending_refund_pence,
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes,
                 exists (select 1 from public.receipts r where r.payment_id = p.id) as has_receipt
            from public.payments p
            left join public.bookings b on b.id = p.booking_id
            left join public.credit_lots l on l.payment_id = p.id
           where p.business_id = p_business_id
             and p.learner_id = p_learner_id
             and p.status in ('paid', 'refunded', 'partially_refunded')
           order by coalesce(p.paid_at, p.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    'refunds', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- The lesson it was for, and whose it was: cash owed back is handed back by them (M3-18).
          select r.id, coalesce(r.settled_at, r.created_at) as at, r.amount_pence, r.status, r.kind,
                 b.starts_at as lesson_at, b.instructor_id
            from public.refunds r
            left join public.bookings b on b.id = r.booking_id
           where r.business_id = p_business_id
             and r.learner_id = p_learner_id
           order by coalesce(r.settled_at, r.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    -- What happened to credit other than buying it, which is a payment above.
    'credit', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select m.id, m.created_at as at, m.kind as move, m.minutes, b.starts_at as lesson_at
            from public.credit_ledger m
            left join public.bookings b on b.id = m.booking_id
           where m.business_id = p_business_id
             and m.learner_id = p_learner_id
             and m.kind <> 'purchase'
           order by m.created_at desc
           limit 50
        ) as recent
    ), '[]'::jsonb)
  );
end;
$$;
