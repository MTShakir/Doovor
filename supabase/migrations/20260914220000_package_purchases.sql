-- Buying a package: a card payment that becomes credit, once (PAY-04, PAY-12, R-10, R-11, M3-13).
--
-- A learner buys a package from a Business they learn with. The card is charged on that
-- Business's own account, as for a lesson, and the payment carries in its metadata what it buys:
-- the package, the learner, how many minutes and how long they last. The server wrote those when
-- it started the payment; nothing comes from the browser. The webhook then writes the payment,
-- the lot and the purchase row in one transaction, and a second delivery of the same payment
-- finds the payment there and changes nothing (acceptance-06).
--
-- Buying online is a distance sale, which can be cancelled for fourteen days, and a service
-- starts inside that time only if the buyer asks for it to (Consumer Contracts Regulations 2013,
-- PRD 15). The learner asks when they buy, and when they asked is kept on the lot (D-086).
--
-- The webhook also stops trusting an event about a Business that arrives from somebody else's
-- account (D-087).

alter table public.credit_lots add column early_start_requested_at timestamptz;

comment on column public.credit_lots.early_start_requested_at is
  'When the learner asked for their lessons to start inside the fourteen days a distance sale can be cancelled in.';

/** As in 20260914210000, with when the learner asked to start kept as part of what was bought. */
create or replace function private.guard_credit_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.minutes_remaining <> 0 then
      raise exception 'a credit lot starts empty and is filled by credit_ledger' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if (new.id, new.business_id, new.learner_id, new.payment_id, new.minutes_total, new.price_pence, new.purchased_at,
      new.early_start_requested_at)
     is distinct from
     (old.id, old.business_id, old.learner_id, old.payment_id, old.minutes_total, old.price_pence, old.purchased_at,
      old.early_start_requested_at) then
    raise exception 'what a credit lot was bought as cannot change' using errcode = 'insufficient_privilege';
  end if;

  if new.minutes_remaining <> old.minutes_remaining
     and current_setting('app.credit_move', true) is distinct from 'on' then
    raise exception 'credit lots change only through credit_ledger' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Credit arriving.
-- ---------------------------------------------------------------------------------------

/**
 * A learner's credit account with a Business, made if it is not there yet and locked until the
 * transaction ends, so moves on it take turns (ARCHITECTURE 7.6). Somebody who is not a learner
 * of the Business cannot have one: the insert fails on its foreign key (PAY-12).
 */
create or replace function private.credit_account_for(p_business_id uuid, p_learner_id uuid)
returns public.credit_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.credit_accounts;
begin
  insert into public.credit_accounts (business_id, learner_id)
  values (p_business_id, p_learner_id)
  on conflict (business_id, learner_id) do nothing;

  select * into v_account
    from public.credit_accounts
   where business_id = p_business_id
     and learner_id = p_learner_id
     for update;

  return v_account;
end;
$$;

revoke all on function private.credit_account_for(uuid, uuid) from public, anon, authenticated;

/**
 * A lot of credit and the purchase row that fills it (PAY-04, M3-13): the way bought credit
 * arrives, whether paid for by card here or recorded as paid in person later (M3-15).
 */
create or replace function private.add_credit_lot(
  p_business_id uuid,
  p_learner_id uuid,
  p_minutes integer,
  p_price_pence integer,
  p_payment_id uuid,
  p_package_id uuid,
  p_expires_at timestamptz,
  p_early_start_requested_at timestamptz,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
begin
  perform private.credit_account_for(p_business_id, p_learner_id);

  insert into public.credit_lots (business_id, learner_id, package_id, payment_id, minutes_total, price_pence,
                                  expires_at, early_start_requested_at, created_by)
  values (p_business_id, p_learner_id, p_package_id, p_payment_id, p_minutes, p_price_pence,
          p_expires_at, p_early_start_requested_at, p_actor_id)
  returning id into v_lot_id;

  insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id, actor_id)
  values (p_business_id, p_learner_id, v_lot_id, 'purchase', p_minutes, p_payment_id, p_actor_id);

  return v_lot_id;
end;
$$;

revoke all on function private.add_credit_lot(uuid, uuid, integer, integer, uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;

/**
 * A card payment for a package, as the webhook reports it (PAY-04, R-11, M3-13).
 *
 * What was bought comes from the payment's metadata, written by the server that started it: the
 * Business, the package, the learner, the minutes and how many days they last. The money is what
 * the provider says arrived, and it is what the lot is worth when it is refunded (PAY-07). The
 * package itself may have changed or gone since; the learner gets what they were shown.
 *
 * Once per payment: another delivery, or another event about the same payment, finds it recorded
 * and changes nothing (acceptance-06). Money that cannot become credit, because the learner is not
 * with that Business, goes back on its own.
 */
create or replace function public.system_record_package_payment(
  p_provider_ref text,
  p_account_id text,
  p_metadata jsonb,
  p_amount_pence integer,
  p_fee_pence integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business public.businesses;
  v_business_id uuid;
  v_package_id uuid;
  v_learner_id uuid;
  v_minutes integer;
  v_expiry_days integer;
  v_early_start timestamptz;
  v_payment_id uuid;
  v_lot_id uuid;
  v_refund_id uuid;
begin
  begin
    v_business_id := (p_metadata ->> 'business_id')::uuid;
    v_package_id := nullif(p_metadata ->> 'package_id', '')::uuid;
    v_learner_id := (p_metadata ->> 'learner_id')::uuid;
    v_minutes := (p_metadata ->> 'minutes')::integer;
    v_expiry_days := nullif(p_metadata ->> 'expiry_days', '')::integer;
  exception
    when data_exception then
      return jsonb_build_object('applied', false, 'reason', 'metadata_invalid');
  end;

  if v_learner_id is null or v_minutes is null or v_minutes <= 0 or v_expiry_days <= 0
     or p_amount_pence is null or p_amount_pence <= 0 then
    return jsonb_build_object('applied', false, 'reason', 'metadata_invalid');
  end if;

  select * into v_business from public.businesses where id = v_business_id;
  if v_business.id is null then
    return jsonb_build_object('applied', false, 'reason', 'business_unknown');
  end if;

  -- The money went to the account it came from, so it is only this Business's if that is its own.
  if v_business.stripe_account_id is distinct from nullif(p_account_id, '') then
    return jsonb_build_object('applied', false, 'reason', 'account_mismatch');
  end if;

  select id into v_payment_id
    from public.payments
   where provider = 'stripe'
     and provider_ref = p_provider_ref
     for update;

  if v_payment_id is not null then
    return jsonb_build_object('applied', false, 'payment_id', v_payment_id, 'outcome', 'already');
  end if;

  if not exists (select 1 from auth.users where id = v_learner_id) then
    return jsonb_build_object('applied', false, 'reason', 'learner_unknown');
  end if;

  insert into public.payments (business_id, learner_id, payer_id, provider_ref, amount_pence, fee_pence,
                               method, status, paid_at)
  values (v_business.id, v_learner_id, v_learner_id, p_provider_ref, p_amount_pence, coalesce(p_fee_pence, 0),
          'card', 'paid', now())
  returning id into v_payment_id;

  -- Credit is held only by a learner of the Business (PAY-12). Anybody else gets the money back.
  if not exists (
    select 1 from public.learner_relationships
     where business_id = v_business.id
       and learner_id = v_learner_id
  ) then
    insert into public.refunds (business_id, payment_id, learner_id, kind, amount_pence, reason)
    values (v_business.id, v_payment_id, v_learner_id, 'card', p_amount_pence,
            'Credit can only be bought from a Business you learn with')
    returning id into v_refund_id;

    perform private.write_audit('refund.requested', 'refund', v_refund_id, v_business.id, null,
      jsonb_build_object('payment_id', v_payment_id, 'amount_pence', p_amount_pence, 'automatic', true,
                         'why', 'not_a_learner'));
    perform private.enqueue_event('payment.refund',
      jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment_id));

    return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'refund_id', v_refund_id,
                              'outcome', 'refunded');
  end if;

  -- The learner could only pay once they had asked to start straight away. The payment going
  -- through is when that request took effect, so that is the time kept (D-086).
  v_early_start := case when p_metadata ->> 'starts_now' = 'yes' then now() end;

  -- A package deleted since the payment started still buys what the learner was shown.
  if v_package_id is not null
     and not exists (select 1 from public.packages where id = v_package_id and business_id = v_business.id) then
    v_package_id := null;
  end if;

  v_lot_id := private.add_credit_lot(
    v_business.id,
    v_learner_id,
    v_minutes,
    p_amount_pence,
    v_payment_id,
    v_package_id,
    case when v_expiry_days is null then null else now() + make_interval(days => v_expiry_days) end,
    v_early_start,
    null
  );

  perform private.write_audit('credit.purchased', 'credit_lot', v_lot_id, v_business.id, null,
    jsonb_build_object('payment_id', v_payment_id, 'package_id', v_package_id, 'minutes', v_minutes,
                       'amount_pence', p_amount_pence));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'lot_id', v_lot_id));

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'lot_id', v_lot_id,
                            'outcome', 'credit_added');
end;
$$;

revoke all on function public.system_record_package_payment(text, text, jsonb, integer, integer)
  from public, anon, authenticated;
grant execute on function public.system_record_package_payment(text, text, jsonb, integer, integer) to service_role;

-- ---------------------------------------------------------------------------------------
-- The webhook.
-- ---------------------------------------------------------------------------------------

/**
 * Whether an event came from the account of the Business it is about (D-087). Every payment is
 * made on the Business's own account (D-011), so its events come from that account and no other.
 */
create or replace function private.event_from_account_of(p_business_id uuid, p_account_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.stripe_account_id is not distinct from nullif(p_account_id, '')
       from public.businesses b
      where b.id = p_business_id),
    false
  );
$$;

revoke all on function private.event_from_account_of(uuid, text) from public, anon, authenticated;

/**
 * The webhook, as in 20260914160000, with two changes. A payment for a package becomes credit
 * (M3-13). And an event about a lesson or a payment that arrives from an account other than its
 * Business's own changes nothing (D-087).
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

    else
      v_outcome := 'recorded';
  end case;

  update public.provider_events
     set processed_at = now(), outcome = v_outcome
   where id = v_id;

  return jsonb_build_object('applied', true, 'outcome', v_outcome);
end;
$$;

revoke all on function public.system_process_stripe_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
