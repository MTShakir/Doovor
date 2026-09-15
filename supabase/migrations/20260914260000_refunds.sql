-- Refunds: given back the way the money came, or as credit, by the people who may (PAY-07,
-- NFR-SEC-06, R-11, M3-17).
--
-- An owner or manager of a Business, or platform staff, gives money back: all of a payment or
-- part of it, always with a reason, and always in the audit log. A school instructor cannot
-- (PRD 6.2). What goes back, and how, follows from what was paid:
--
--   A lesson paid by card goes back to the card. The refund is written down as waiting, the job
--   sends it to the provider under a key of its own, and it is settled from what the provider
--   says, straight away or later by webhook.
--   A lesson paid in cash or by bank transfer is handed back in person, so the refund is settled
--   as soon as it is written down.
--   A lesson can be refunded as credit instead: minutes with the Business, in proportion to what
--   is given back and worth exactly that, booked with like any other credit.
--   Credit bought and not used goes back as money, a number of minutes at a time, valued as
--   packages/core/src/credit.ts values it. The minutes leave the balance when the refund is
--   issued, so they cannot be spent while the money is on its way, and come back if the provider
--   cannot pay it.
--
-- The webhook reconciles refunds with the provider. One this app sent carries its own id in its
-- metadata, so it is found however early the event arrives; one made in the provider's own
-- dashboard is recorded as it is.

alter type public.refund_kind add value if not exists 'offline';

-- Credit put back by nobody in particular, when a refund could not be paid, says which refund.
alter table public.credit_ledger drop constraint credit_ledger_adjustment;
alter table public.credit_ledger add constraint credit_ledger_adjustment
  check (kind <> 'adjustment' or (reason is not null and (actor_id is not null or refund_id is not null)));

-- ---------------------------------------------------------------------------------------
-- What a lesson's payment status is, once money has gone back.
-- ---------------------------------------------------------------------------------------

/**
 * A lesson's payment status, worked out again from its payments after a refund moves. A payment
 * still standing pays for the lesson whatever happened to any other, so a second payment given
 * back leaves the lesson paid by the first (M3-07). Only lessons paid in money are touched.
 */
create or replace function private.recompute_booking_payment(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_standing public.payments;
  v_next public.booking_payment_status;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null
     or v_booking.payment_status not in ('paid_card', 'paid_cash', 'paid_bank', 'refunded', 'partially_refunded') then
    return;
  end if;

  select * into v_standing
    from public.payments
   where booking_id = p_booking_id and status = 'paid'
   order by paid_at nulls last
   limit 1;

  v_next := case
    when v_standing.id is not null then
      (case v_standing.method when 'cash' then 'paid_cash' when 'bank' then 'paid_bank' else 'paid_card' end)::public.booking_payment_status
    when exists (select 1 from public.payments where booking_id = p_booking_id and status = 'partially_refunded') then
      'partially_refunded'::public.booking_payment_status
    when exists (select 1 from public.payments where booking_id = p_booking_id and status = 'refunded') then
      'refunded'::public.booking_payment_status
    else v_booking.payment_status
  end;

  if v_next is distinct from v_booking.payment_status then
    update public.bookings set payment_status = v_next, version = version + 1 where id = p_booking_id;
  end if;
end;
$$;

revoke all on function private.recompute_booking_payment(uuid) from public, anon, authenticated;

/**
 * Puts back credit that left the balance for a refund that was never paid. Safe to run twice:
 * what has already been put back for the refund is not put back again.
 */
create or replace function private.restore_refunded_credit(p_refund_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move record;
  v_restored integer := 0;
begin
  if exists (select 1 from public.credit_ledger where refund_id = p_refund_id and kind = 'adjustment') then
    return 0;
  end if;

  for v_move in
    select business_id, learner_id, lot_id, -minutes as minutes
      from public.credit_ledger
     where refund_id = p_refund_id
       and kind = 'refund'
     order by created_at
  loop
    perform private.credit_account_for(v_move.business_id, v_move.learner_id);
    insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, refund_id, reason)
    values (v_move.business_id, v_move.learner_id, v_move.lot_id, 'adjustment', v_move.minutes, p_refund_id,
            'The refund could not be paid back');
    v_restored := v_restored + v_move.minutes;
  end loop;

  return v_restored;
end;
$$;

revoke all on function private.restore_refunded_credit(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Settling a refund.
-- ---------------------------------------------------------------------------------------

/**
 * A refund reaching the outcome the provider reports, as in 20260914130000 with three changes:
 * the lesson's status is worked out from all its payments, a refund that went through can still
 * fail afterwards and be counted back, and credit taken for a refund that failed comes back.
 */
create or replace function public.system_settle_refund(
  p_refund_id uuid,
  p_provider_ref text,
  p_status text default 'succeeded'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_status public.refund_status;
  v_provider_ref text := nullif(btrim(coalesce(p_provider_ref, '')), '');
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then
    return jsonb_build_object('applied', false, 'reason', 'refund_unknown');
  end if;

  v_status := (case p_status
                 when 'succeeded' then 'succeeded'
                 when 'failed' then 'failed'
                 when 'cancelled' then 'cancelled'
                 when 'canceled' then 'cancelled'
                 else 'pending'
               end)::public.refund_status;

  -- A waiting refund settles; one that went through can still fail afterwards, as it does when the
  -- card has been closed. Nothing else changes a refund, but a provider id is always worth keeping.
  if not (v_refund.status = 'pending' and v_status <> 'pending')
     and not (v_refund.status = 'succeeded' and v_status = 'failed') then
    if v_provider_ref is not null and v_refund.provider_ref is null then
      update public.refunds set provider_ref = v_provider_ref where id = p_refund_id;
    end if;
    return jsonb_build_object('applied', false,
                              'reason', case when v_refund.status = 'pending' then 'still_pending' else 'already_settled' end);
  end if;

  update public.refunds
     set provider_ref = coalesce(v_provider_ref, provider_ref),
         status = v_status,
         settled_at = now()
   where id = p_refund_id;

  if v_status = 'succeeded' then
    if v_refund.payment_id is not null then
      update public.payments
         set refunded_pence = least(amount_pence, refunded_pence + v_refund.amount_pence),
             status = (case when refunded_pence + v_refund.amount_pence >= amount_pence
                            then 'refunded' else 'partially_refunded' end)::public.payment_status
       where id = v_refund.payment_id;
    end if;
    if v_refund.booking_id is not null then
      perform private.recompute_booking_payment(v_refund.booking_id);
    end if;

    perform private.write_audit('refund.settled', 'refund', p_refund_id, v_refund.business_id, null,
      jsonb_build_object('provider_ref', coalesce(v_provider_ref, v_refund.provider_ref), 'amount_pence', v_refund.amount_pence));
    perform private.enqueue_event('payment.refunded',
      jsonb_build_object('refund_id', p_refund_id, 'booking_id', v_refund.booking_id, 'amount_pence', v_refund.amount_pence));
    return jsonb_build_object('applied', true, 'status', 'succeeded');
  end if;

  -- It was not paid. Money counted as given back is counted as kept again, and credit that left
  -- the balance for it comes back.
  if v_refund.status = 'succeeded' and v_refund.payment_id is not null then
    update public.payments
       set refunded_pence = greatest(0, refunded_pence - v_refund.amount_pence),
           status = (case when refunded_pence - v_refund.amount_pence <= 0
                          then 'paid' else 'partially_refunded' end)::public.payment_status
     where id = v_refund.payment_id;
    if v_refund.booking_id is not null then
      perform private.recompute_booking_payment(v_refund.booking_id);
    end if;
  end if;
  perform private.restore_refunded_credit(p_refund_id);

  perform private.write_audit('refund.failed', 'refund', p_refund_id, v_refund.business_id,
    jsonb_build_object('status', v_refund.status), jsonb_build_object('status', v_status, 'amount_pence', v_refund.amount_pence));
  perform private.enqueue_event('payment.refund_failed',
    jsonb_build_object('refund_id', p_refund_id, 'booking_id', v_refund.booking_id, 'amount_pence', v_refund.amount_pence));
  return jsonb_build_object('applied', true, 'status', v_status::text);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Issuing one.
-- ---------------------------------------------------------------------------------------

/** Owners, managers and platform staff give money back; a school instructor does not (PRD 6.2). */
create or replace function private.auth_can_refund(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_has_role(p_business_id, array['owner', 'manager']::public.membership_role[])
      or private.auth_is_staff('support');
$$;

revoke all on function private.auth_can_refund(uuid) from public, anon, authenticated;

/**
 * What can be given back for a payment, for the screen that gives it back (PAY-07). Null minutes
 * and lot for a lesson; a lot for credit bought, with what its unused minutes are worth.
 */
create or replace function public.refund_options(p_payment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_lot public.credit_lots;
  v_booking public.bookings;
  v_pending integer;
  v_usable integer;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_can_refund(v_payment.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select coalesce(sum(amount_pence), 0)::integer into v_pending
    from public.refunds where payment_id = p_payment_id and status = 'pending';
  select * into v_lot from public.credit_lots where payment_id = p_payment_id;
  select * into v_booking from public.bookings where id = v_payment.booking_id;

  v_usable := case
    when v_lot.id is null then 0
    when v_lot.expires_at is not null and v_lot.expires_at <= now() then 0
    else v_lot.minutes_remaining
  end;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'method', v_payment.method,
    'status', v_payment.status,
    'amount_pence', v_payment.amount_pence,
    'refunded_pence', v_payment.refunded_pence,
    'pending_pence', v_pending,
    'refundable_pence', greatest(0, v_payment.amount_pence - v_payment.refunded_pence - v_pending),
    'lesson_at', v_booking.starts_at,
    'lesson_minutes', case when v_booking.id is null then null
                           else (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::integer end,
    'lot', case when v_lot.id is null then null else jsonb_build_object(
      'minutes_total', v_lot.minutes_total,
      'usable_minutes', v_usable,
      'price_pence', v_lot.price_pence,
      'value_pence', floor(v_lot.price_pence::numeric * v_lot.minutes_remaining / v_lot.minutes_total)::integer
                     - floor(v_lot.price_pence::numeric * (v_lot.minutes_remaining - v_usable) / v_lot.minutes_total)::integer
    ) end
  );
end;
$$;

/**
 * Gives money back (PAY-07). `p_to` is `payment`, back the way it was paid, or `credit`, as
 * minutes with the Business, for a lesson. A lesson is refunded by an amount, all that is left of
 * it when none is given; credit bought is refunded by minutes, all that is unused when none is
 * given. Returns the refund.
 */
create or replace function public.issue_refund(
  p_payment_id uuid,
  p_reason text,
  p_amount_pence integer default null,
  p_minutes integer default null,
  p_to text default 'payment'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payment public.payments;
  v_booking public.bookings;
  v_lot public.credit_lots;
  v_pending integer;
  v_refundable integer;
  v_usable integer;
  v_amount integer;
  v_minutes integer;
  v_lesson_minutes integer;
  v_money_kind public.refund_kind;
  v_refund_id uuid;
  v_credit_lot uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;
  if p_to is null or p_to not in ('payment', 'credit') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "to"}';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_can_refund(v_payment.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_payment.status not in ('paid', 'partially_refunded') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment"}';
  end if;

  select coalesce(sum(amount_pence), 0)::integer into v_pending
    from public.refunds where payment_id = p_payment_id and status = 'pending';
  v_refundable := v_payment.amount_pence - v_payment.refunded_pence - v_pending;
  v_money_kind := (case when v_payment.method = 'card' then 'card' else 'offline' end)::public.refund_kind;

  select * into v_lot from public.credit_lots where payment_id = p_payment_id;

  if v_lot.id is not null then
    -- Credit bought and not used goes back as money, at the price it was bought for (PAY-07).
    if p_to <> 'payment' or p_amount_pence is not null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "minutes"}';
    end if;

    -- The account first, as every move on credit takes it, then the lot as it is now.
    perform private.credit_account_for(v_lot.business_id, v_lot.learner_id);
    select * into v_lot from public.credit_lots where id = v_lot.id;

    v_usable := case when v_lot.expires_at is not null and v_lot.expires_at <= now() then 0 else v_lot.minutes_remaining end;
    v_minutes := coalesce(p_minutes, v_usable);
    if v_minutes <= 0 or v_minutes > v_usable then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "minutes"}';
    end if;

    -- What is left is worth floor(price * remaining / total); taking some of it is worth the
    -- difference, so pieces add up to the whole and never to more (credit.ts, refundValuePence).
    v_amount := least(
      v_refundable,
      floor(v_lot.price_pence::numeric * v_lot.minutes_remaining / v_lot.minutes_total)::integer
        - floor(v_lot.price_pence::numeric * (v_lot.minutes_remaining - v_minutes) / v_lot.minutes_total)::integer
    );
    if v_amount <= 0 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "minutes"}';
    end if;

    insert into public.refunds (business_id, payment_id, learner_id, kind, provider, amount_pence, reason, requested_by)
    values (v_payment.business_id, p_payment_id, v_payment.learner_id, v_money_kind,
            case when v_money_kind = 'card' then 'stripe' else 'offline' end, v_amount, v_reason, v_user)
    returning id into v_refund_id;

    insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, refund_id, actor_id, reason)
    values (v_lot.business_id, v_lot.learner_id, v_lot.id, 'refund', -v_minutes, v_refund_id, v_user, v_reason);

  else
    if p_minutes is not null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "minutes"}';
    end if;
    v_amount := coalesce(p_amount_pence, v_refundable);
    if v_amount <= 0 or v_amount > v_refundable then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "amount"}';
    end if;

    if p_to = 'credit' then
      -- As credit: minutes in proportion to what is given back, worth exactly that.
      select * into v_booking from public.bookings where id = v_payment.booking_id;
      if v_booking.id is null then
        raise exception 'VALIDATION_FAILED' using detail = '{"field": "to"}';
      end if;
      v_lesson_minutes := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::integer;
      v_minutes := floor(v_lesson_minutes::numeric * v_amount / v_payment.amount_pence)::integer;
      if v_minutes <= 0 then
        raise exception 'VALIDATION_FAILED' using detail = '{"field": "amount"}';
      end if;

      insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, provider, amount_pence, reason, requested_by)
      values (v_payment.business_id, p_payment_id, v_payment.booking_id, v_payment.learner_id, 'credit', 'credit',
              v_amount, v_reason, v_user)
      returning id into v_refund_id;

      perform private.credit_account_for(v_payment.business_id, v_payment.learner_id);
      insert into public.credit_lots (business_id, learner_id, minutes_total, price_pence, created_by)
      values (v_payment.business_id, v_payment.learner_id, v_minutes, v_amount, v_user)
      returning id into v_credit_lot;
      insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, refund_id, actor_id, reason)
      values (v_payment.business_id, v_payment.learner_id, v_credit_lot, 'adjustment', v_minutes, v_payment.booking_id,
              v_refund_id, v_user, v_reason);
    else
      insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, provider, amount_pence, reason, requested_by)
      values (v_payment.business_id, p_payment_id, v_payment.booking_id, v_payment.learner_id, v_money_kind,
              case when v_money_kind = 'card' then 'stripe' else 'offline' end, v_amount, v_reason, v_user)
      returning id into v_refund_id;
    end if;
  end if;

  perform private.write_audit('refund.issued', 'refund', v_refund_id, v_payment.business_id, null,
    jsonb_build_object('payment_id', p_payment_id, 'amount_pence', v_amount, 'minutes', v_minutes, 'to', p_to,
                       'reason', v_reason));

  -- Money handed back in person, and credit, are given back as soon as they are written down. A
  -- card refund waits for the provider.
  if p_to = 'credit' or v_money_kind = 'offline' then
    perform public.system_settle_refund(v_refund_id, null, 'succeeded');
  else
    perform private.enqueue_event('payment.refund',
      jsonb_build_object('refund_id', v_refund_id, 'payment_id', p_payment_id, 'booking_id', v_payment.booking_id));
  end if;

  return v_refund_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The provider's word on a refund.
-- ---------------------------------------------------------------------------------------

/**
 * A refund as the provider reports it (R-11). One this app sent is found by the id in its metadata
 * or by the provider's id, and settled. One made in the provider's own dashboard is written down
 * against its payment and settled as reported.
 */
create or replace function public.system_record_provider_refund(p_account_id text, p_refund jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_payment public.payments;
  v_ours uuid;
  v_new uuid;
  v_status text := p_refund ->> 'status';
  v_amount integer;
begin
  begin
    v_ours := nullif(p_refund -> 'metadata' ->> 'refund_id', '')::uuid;
  exception
    when data_exception then
      v_ours := null;
  end;

  if v_ours is not null then
    select * into v_refund from public.refunds where id = v_ours;
  end if;
  if v_refund.id is null then
    select * into v_refund from public.refunds where provider = 'stripe' and provider_ref = p_refund ->> 'id';
  end if;

  if v_refund.id is not null then
    if not private.event_from_account_of(v_refund.business_id, p_account_id) then
      return jsonb_build_object('applied', false, 'reason', 'account_mismatch');
    end if;
    return public.system_settle_refund(v_refund.id, p_refund ->> 'id', v_status);
  end if;

  select * into v_payment
    from public.payments
   where provider = 'stripe' and provider_ref = p_refund ->> 'payment_intent'
     for update;
  if v_payment.id is null then
    return jsonb_build_object('applied', false, 'reason', 'payment_unknown');
  end if;
  if not private.event_from_account_of(v_payment.business_id, p_account_id) then
    return jsonb_build_object('applied', false, 'reason', 'account_mismatch');
  end if;

  begin
    v_amount := (p_refund ->> 'amount')::integer;
  exception
    when data_exception then
      v_amount := null;
  end;
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'amount_invalid');
  end if;

  insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, provider, provider_ref, amount_pence, reason)
  values (v_payment.business_id, v_payment.id, v_payment.booking_id, v_payment.learner_id, 'card', 'stripe',
          p_refund ->> 'id', v_amount, 'Refunded in the payment provider''s own dashboard')
  returning id into v_new;

  perform private.write_audit('refund.recorded', 'refund', v_new, v_payment.business_id, null,
    jsonb_build_object('payment_id', v_payment.id, 'amount_pence', v_amount, 'provider_ref', p_refund ->> 'id'));

  return public.system_settle_refund(v_new, p_refund ->> 'id', v_status) || jsonb_build_object('recorded', true);
end;
$$;

/**
 * The webhook, as in 20260914220000, with refunds reported by the provider reconciled (M3-17).
 */
create or replace function public.system_process_stripe_event(
  p_event_id text,
  p_event_type text,
  p_account_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_outcome text;
  v_changed integer := 0;
  v_booking uuid;
  v_booking_business uuid;
  v_package boolean;
  v_result jsonb;
  v_payment public.payments;
begin
  if p_event_id is null or char_length(btrim(p_event_id)) = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "eventId"}';
  end if;

  insert into public.provider_events (provider, event_id, event_type, account_id)
  values ('stripe', p_event_id, coalesce(p_event_type, 'unknown'), nullif(p_account_id, ''))
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('applied', false, 'outcome', 'duplicate');
  end if;

  v_booking := nullif(p_payload -> 'metadata' ->> 'booking_id', '')::uuid;
  v_package := coalesce(p_payload -> 'metadata' ? 'package_id', false);
  select business_id into v_booking_business from public.bookings where id = v_booking;

  case p_event_type
    when 'account.updated' then
      v_changed := public.system_set_payments_state(
        coalesce(nullif(p_account_id, ''), p_payload ->> 'id'),
        (p_payload ->> 'charges_enabled')::boolean,
        (p_payload ->> 'payouts_enabled')::boolean,
        (p_payload ->> 'details_submitted')::boolean
      );
      v_outcome := case when v_changed > 0 then 'account_updated' else 'account_unknown' end;

    when 'payment_intent.amount_capturable_updated' then
      if v_booking is null then
        v_outcome := 'no_booking';
      elsif v_booking_business is not null and not private.event_from_account_of(v_booking_business, p_account_id) then
        v_outcome := 'account_mismatch';
      else
        v_result := public.system_record_card_authorisation(
          p_payload ->> 'id',
          v_booking,
          (p_payload ->> 'amount_capturable')::int
        );
        v_outcome := case
          when not (v_result ->> 'applied')::boolean then coalesce(v_result ->> 'reason', 'authorisation_already_recorded')
          else 'payment_authorised'
        end;
      end if;

    when 'payment_intent.succeeded' then
      if v_package then
        v_result := public.system_record_package_payment(
          p_payload ->> 'id',
          p_account_id,
          p_payload -> 'metadata',
          (p_payload ->> 'amount_received')::int,
          coalesce((p_payload ->> 'application_fee_amount')::int, 0)
        );
        v_outcome := case
          when not (v_result ->> 'applied')::boolean then coalesce(v_result ->> 'reason', 'payment_already_recorded')
          when v_result ->> 'refund_id' is not null then 'payment_refunded'
          else 'credit_added'
        end;
      elsif v_booking is null then
        v_outcome := 'no_booking';
      elsif v_booking_business is not null and not private.event_from_account_of(v_booking_business, p_account_id) then
        v_outcome := 'account_mismatch';
      else
        v_result := public.system_record_card_payment(
          p_payload ->> 'id',
          v_booking,
          (p_payload ->> 'amount_received')::int,
          coalesce((p_payload ->> 'application_fee_amount')::int, 0)
        );
        v_outcome := case
          when not (v_result ->> 'applied')::boolean then coalesce(v_result ->> 'reason', 'payment_already_recorded')
          when v_result ->> 'refund_id' is not null then 'payment_refunded'
          when v_result ->> 'outcome' = 'revived' then 'payment_recorded_late'
          else 'payment_recorded'
        end;
      end if;

    when 'payment_intent.canceled' then
      select * into v_payment
        from public.payments
       where provider = 'stripe' and provider_ref = p_payload ->> 'id';
      v_outcome := case
        when v_payment.id is null then 'payment_unknown'
        when not private.event_from_account_of(v_payment.business_id, p_account_id) then 'account_mismatch'
        when public.system_record_payment_cancelled(v_payment.id) then 'payment_cancelled'
        else 'cancellation_already_recorded'
      end;

    when 'payment_intent.payment_failed' then
      if v_package then
        -- The learner was there when the card was refused and was told on the screen. Nothing was
        -- written down for a package that was not bought, so there is nothing to change.
        v_outcome := 'package_payment_failed';
      elsif v_booking is null then
        v_outcome := 'no_booking';
      elsif v_booking_business is not null and not private.event_from_account_of(v_booking_business, p_account_id) then
        v_outcome := 'account_mismatch';
      else
        perform public.system_record_failed_payment(
          p_payload ->> 'id', v_booking, (p_payload ->> 'amount')::int
        );
        v_outcome := 'payment_failed';
      end if;

    when 'refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated' then
      v_result := public.system_record_provider_refund(p_account_id, p_payload);
      v_outcome := case
        when (v_result ->> 'applied')::boolean then 'refund_' || coalesce(v_result ->> 'status', 'settled')
        when coalesce((v_result ->> 'recorded')::boolean, false) then 'refund_recorded'
        else coalesce(v_result ->> 'reason', 'refund_unchanged')
      end;

    else
      v_outcome := 'recorded';
  end case;

  update public.provider_events
     set processed_at = now(), outcome = v_outcome
   where id = v_id;

  return jsonb_build_object('applied', true, 'outcome', v_outcome);
end;
$$;

revoke all on function public.refund_options(uuid) from public, anon;
revoke all on function public.issue_refund(uuid, text, integer, integer, text) from public, anon;
revoke all on function public.system_record_provider_refund(text, jsonb) from public, anon, authenticated;
revoke all on function public.system_process_stripe_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.refund_options(uuid) to authenticated;
grant execute on function public.issue_refund(uuid, text, integer, integer, text) to authenticated;
grant execute on function public.system_record_provider_refund(text, jsonb) to service_role;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
