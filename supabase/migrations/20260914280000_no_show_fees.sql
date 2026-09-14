-- No-show fees, and fees charged to a kept card (PAY-09, R-09, M3-19).
--
-- A lesson nobody came to counts as a late cancellation by the learner (R-09). The fee its
-- Business's policy sets comes out of the credit that paid for the lesson (R-07) or out of the
-- money already paid, and the rest goes back, exactly as calling a lesson off late does (D-092).
-- The learner can dispute a no-show for seven days, and the lesson records until when.
--
-- A fee nothing has paid, for a lesson called off late or nobody came to, is charged by a job to
-- the card the learner keeps with the Business, with nobody at the keyboard (PAY-09). Only at a
-- Business that takes cards and does not have its learners pay in person, and only for a learner
-- it keeps a card for: otherwise, or when the card will not pay, the fee is owed (PAY-06) and is
-- paid on screen or in person. A card payment that arrives for a fee pays the fee.
--
-- mark_no_show is the function from 20260913250000, system_record_card_payment the one from
-- 20260914150000, and cancel_booking, learner_balance and record_offline_payment the ones from
-- 20260914270000, each with this added.

alter table public.bookings add column dispute_until timestamptz;

comment on column public.bookings.dispute_until is
  'For a lesson marked as a no-show: until when the learner can dispute it (R-09).';

-- ---------------------------------------------------------------------------------------
-- Asking for a fee.
-- ---------------------------------------------------------------------------------------

/**
 * Asks the fee job to charge a fee nothing has paid to the card the learner keeps with the
 * Business (PAY-09). Only a lesson called off late or nobody came to, still unpaid, at a Business
 * that takes cards and does not have its learners pay in person, for a learner it keeps a card
 * for. Returns whether it asked.
 */
create or replace function private.ask_for_fee(p_booking_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null
     or v_booking.status not in ('cancelled', 'no_show')
     or coalesce(v_booking.fee_pence, 0) <= 0
     or v_booking.payment_status <> 'unpaid'
     or private.payment_mode(v_booking.business_id) = 'offline'
     or not exists (
          select 1 from public.billing_customers bc
           where bc.business_id = v_booking.business_id
             and bc.learner_id = v_booking.learner_id
        ) then
    return false;
  end if;

  perform private.enqueue_event('payment.fee_charge', jsonb_build_object('booking_id', p_booking_id));
  return true;
end;
$$;

/**
 * The fee the job is to charge for a lesson (PAY-09): the account it is paid into, the learner's
 * customer on it, and the amount. Null once there is nothing to charge: paid some other way in
 * the meantime, or at a Business that no longer takes cards.
 */
create or replace function public.system_fee_to_charge(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id', b.id,
           'business_id', b.business_id,
           'account_id', bus.stripe_account_id,
           'customer_id', bc.provider_customer_id,
           'amount_pence', b.fee_pence,
           'kind', b.status
         )
    from public.bookings b
    join public.businesses bus on bus.id = b.business_id
    left join public.billing_customers bc on bc.business_id = b.business_id and bc.learner_id = b.learner_id
   where b.id = p_booking_id
     and b.status in ('cancelled', 'no_show')
     and b.fee_pence > 0
     and b.payment_status = 'unpaid'
     and bus.stripe_charges_enabled
     and bus.stripe_account_id is not null;
$$;

/**
 * A fee the job could not charge to a card that is kept (PAY-09): refused, run out, or wanting
 * its holder to confirm. The fee stays owed, the learner is asked to pay it, and both sides are
 * told, once. A learner with no card to charge is told nothing new: the fee is already in their
 * balance, and what they were told about the lesson said so.
 */
create or replace function public.system_record_fee_charge_failed(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_fee integer;
begin
  if p_reason is null or p_reason not in ('expired_card', 'declined', 'authentication_required') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  update public.bookings
     set payment_status = 'failed', version = version + 1
   where id = p_booking_id
     and status in ('cancelled', 'no_show')
     and fee_pence > 0
     and payment_status = 'unpaid'
  returning business_id, fee_pence into v_business, v_fee;

  if v_business is null then
    return false;
  end if;

  perform private.write_audit('payment.charge_failed', 'booking', p_booking_id, v_business, null,
    jsonb_build_object('reason', p_reason, 'fee_pence', v_fee));
  perform private.enqueue_event('payment.charge_failed',
    jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason, 'fee', true));

  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Nobody came.
-- ---------------------------------------------------------------------------------------

/**
 * Marks a lesson nobody came to (R-09), a quarter of an hour after it started, which settles its
 * money as a late cancellation by the learner: the fee out of credit or out of what was paid, the
 * rest back, and a fee nothing paid charged to the kept card. The learner can dispute it for seven
 * days.
 */
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
  if v_booking.payment_status = 'paid_credit' then
    v_credit := private.give_back_credit(p_booking_id, v_percent, v_user);
    update public.bookings
       set payment_status = case
             when (v_credit ->> 'kept')::integer = 0 then 'refunded'
             when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
             else 'partially_refunded'
           end::public.booking_payment_status
     where id = p_booking_id;
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

-- ---------------------------------------------------------------------------------------
-- Calling a lesson off: a fee nothing paid goes to the kept card.
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

-- ---------------------------------------------------------------------------------------
-- A card payment that arrives for a fee pays it.
-- ---------------------------------------------------------------------------------------

/**
 * The card payment recorder from 20260914150000, which now also takes the fee for a lesson
 * called off late or nobody came to (PAY-09, M3-19).
 */
create or replace function public.system_record_card_payment(
  p_provider_ref text,
  p_booking_id uuid,
  p_amount_pence integer,
  p_fee_pence integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
  v_payment_id uuid;
  v_outcome text;
  v_reason text;
  v_refund_id uuid;
  v_refund_pence integer := p_amount_pence;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('applied', false, 'reason', 'booking_unknown');
  end if;

  select * into v_payment
    from public.payments
   where provider = 'stripe' and provider_ref = p_provider_ref
     for update;

  -- The same payment again is a replay, and changes nothing (R-11).
  if v_payment.id is not null and v_payment.status in ('paid', 'refunded', 'partially_refunded') then
    return jsonb_build_object('applied', false, 'payment_id', v_payment.id, 'outcome', 'already');
  end if;

  if v_payment.id is null then
    insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                                 amount_pence, fee_pence, method, status, paid_at)
    values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, p_provider_ref,
            p_amount_pence, coalesce(p_fee_pence, 0), 'card', 'paid', now())
    returning id into v_payment_id;
  else
    v_payment_id := v_payment.id;
    update public.payments
       set status = 'paid',
           paid_at = now(),
           booking_id = p_booking_id,
           amount_pence = p_amount_pence,
           fee_pence = coalesce(p_fee_pence, 0)
     where id = v_payment_id;
  end if;

  -- A different payment for a lesson that is already paid for, by any means, is a double charge.
  if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'paid_credit') then
    v_outcome := 'duplicate';
    v_reason := 'This lesson had already been paid for';

  elsif v_booking.status in ('pending_payment', 'confirmed', 'in_progress', 'completed') then
    update public.bookings
       set status = case when status = 'pending_payment' then 'confirmed' else status end,
           payment_status = 'paid_card',
           hold_expires_at = null,
           version = version + 1
     where id = p_booking_id;
    v_outcome := 'confirmed';

  elsif v_booking.status = 'expired' then
    begin
      update public.bookings
         set status = 'confirmed',
             payment_status = 'paid_card',
             hold_expires_at = null,
             version = version + 1
       where id = p_booking_id;
      v_outcome := 'revived';
    exception
      when exclusion_violation then
        v_outcome := 'slot_gone';
        v_reason := 'The lesson was no longer held when the payment arrived';
    end;

  -- The fee for a lesson called off late, or nobody came to, that nothing else has paid: this pays
  -- it, whether the fee job charged a kept card or the learner paid on screen (PAY-09, M3-19).
  -- Anything beyond the fee goes back.
  elsif v_booking.status in ('cancelled', 'no_show')
        and coalesce(v_booking.fee_pence, 0) > 0
        and v_booking.payment_status in ('unpaid', 'pending', 'failed') then
    update public.bookings
       set payment_status = 'paid_card',
           version = version + 1
     where id = p_booking_id;
    v_outcome := 'fee_paid';
    if p_amount_pence > v_booking.fee_pence then
      v_reason := 'More than the fee was paid';
      v_refund_pence := p_amount_pence - v_booking.fee_pence;
    end if;

  else
    v_outcome := 'slot_gone';
    v_reason := 'The lesson was no longer held when the payment arrived';
  end if;

  if v_reason is not null then
    insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason)
    values (v_booking.business_id, v_payment_id, p_booking_id, v_booking.learner_id, 'card', v_refund_pence, v_reason)
    returning id into v_refund_id;

    perform private.write_audit('refund.requested', 'refund', v_refund_id, v_booking.business_id, null,
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id,
                         'amount_pence', v_refund_pence, 'automatic', true, 'why', v_outcome));
    perform private.enqueue_event('payment.refund',
      jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment_id, 'booking_id', p_booking_id));
  end if;

  -- A fee paid is a payment received, even with something over it going back.
  if v_reason is null or v_outcome = 'fee_paid' then
    perform private.write_audit('payment.received', 'payment', v_payment_id, v_booking.business_id, null,
      jsonb_build_object('booking_id', p_booking_id, 'amount_pence', p_amount_pence, 'outcome', v_outcome));
    perform private.enqueue_event('payment.received',
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));
  end if;

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'outcome', v_outcome,
                            'refund_id', v_refund_id);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- A no-show fee is owed, and paid in person, like a late cancellation fee.
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
  v_amount := case when v_fee_owed then v_booking.fee_pence else v_booking.price_pence end;
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
    jsonb_build_object('booking_id', p_booking_id, 'method', p_method, 'amount_pence', v_amount, 'fee', v_fee_owed));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return v_payment_id;
end;
$$;

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
    raise exception 'NOT_ALLOWED' using errcode = '42501';
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
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes
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

revoke all on function private.ask_for_fee(uuid) from public, anon, authenticated;
revoke all on function public.system_fee_to_charge(uuid) from public, anon, authenticated;
revoke all on function public.system_record_fee_charge_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.system_fee_to_charge(uuid) to service_role;
grant execute on function public.system_record_fee_charge_failed(uuid, text) to service_role;
