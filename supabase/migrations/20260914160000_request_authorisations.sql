-- A request to book holds the money rather than taking it (R-12, PAY-03, M3-08).
--
-- At a Business that takes its money at booking, a learner asking for a lesson authorises
-- their card for the price: the bank sets the money aside and nothing is taken. When the
-- instructor accepts, the authorisation is captured and the lesson is paid for. When they
-- decline, or the request runs out, it is released and the learner was never charged
-- (ARCHITECTURE 8.2).
--
-- The database decides which authorisations are due for which; a job does the part that
-- means talking to the provider, and the webhook writes down what the provider did.

-- Money set aside by the bank for a payment, not yet taken.
alter type public.payment_status add value if not exists 'authorised';

-- ---------------------------------------------------------------------------------------
-- The authorisation arrives.
-- ---------------------------------------------------------------------------------------

/**
 * Records that a learner's card has been authorised for a lesson (R-12). Idempotent on the
 * provider's id. An authorisation for a lesson that is no longer on, because the request was
 * declined or ran out while the learner was typing, is still written down, so the sweep that
 * releases authorisations finds it.
 */
create or replace function public.system_record_card_authorisation(
  p_provider_ref text,
  p_booking_id uuid,
  p_amount_pence integer
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
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('applied', false, 'reason', 'booking_unknown');
  end if;

  select * into v_payment
    from public.payments
   where provider = 'stripe' and provider_ref = p_provider_ref
     for update;

  -- Anything past pending has already heard about this authorisation, or about what came after.
  if v_payment.id is not null and v_payment.status <> 'pending' then
    return jsonb_build_object('applied', false, 'payment_id', v_payment.id, 'outcome', 'already');
  end if;

  if v_payment.id is null then
    insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                                 amount_pence, method, status)
    values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, p_provider_ref,
            p_amount_pence, 'card', 'authorised')
    returning id into v_payment_id;
  else
    v_payment_id := v_payment.id;
    update public.payments
       set status = 'authorised', amount_pence = p_amount_pence, booking_id = p_booking_id
     where id = v_payment_id;
  end if;

  if v_booking.status in ('requested', 'confirmed', 'in_progress', 'completed') then
    update public.bookings
       set payment_mode = 'at_booking',
           payment_status = case when payment_status in ('unpaid', 'failed', 'pending')
                                 then 'pending'::public.booking_payment_status else payment_status end,
           version = version + 1
     where id = p_booking_id;
    v_outcome := 'authorised';
  else
    v_outcome := 'release';
  end if;

  perform private.write_audit('payment.authorised', 'payment', v_payment_id, v_booking.business_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'amount_pence', p_amount_pence, 'outcome', v_outcome));
  perform private.enqueue_event('payment.authorised',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'outcome', v_outcome);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- What is due: capture for a lesson that is on, release for one that is not.
-- ---------------------------------------------------------------------------------------

/**
 * Every authorisation that has somewhere to go (R-12). A lesson that is on is captured; a
 * lesson that was declined, ran out or was cancelled is released. A request still waiting for
 * an answer is neither, and is left where it is.
 */
create or replace function public.system_authorisations_due()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'capture', coalesce(jsonb_agg(one) filter (where due = 'capture'), '[]'::jsonb),
    'release', coalesce(jsonb_agg(one) filter (where due = 'release'), '[]'::jsonb)
  )
    from (
      select jsonb_build_object(
               'payment_id', p.id,
               'booking_id', p.booking_id,
               'account_id', bus.stripe_account_id,
               'intent_id', p.provider_ref,
               'amount_pence', p.amount_pence
             ) as one,
             case
               when b.status in ('confirmed', 'in_progress', 'completed') then 'capture'
               when b.status = 'requested' then null
               else 'release'
             end as due
        from public.payments p
        join public.bookings b on b.id = p.booking_id
        join public.businesses bus on bus.id = p.business_id
       -- Compared as text: a SQL function's body is checked when it is created, and the value
       -- was only added to the type a moment ago, in this same transaction.
       where p.status::text = 'authorised'
         and p.provider_ref is not null
         and bus.stripe_account_id is not null
    ) as candidates
   where due is not null;
$$;

/**
 * An attempt or an authorisation the provider has called off. No money moved, so there is
 * nothing to give back, and a lesson that was waiting on it owes what it did before.
 */
create or replace function public.system_record_payment_cancelled(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or v_payment.status not in ('pending', 'authorised') then
    return false;
  end if;

  update public.payments set status = 'cancelled' where id = p_payment_id;

  if v_payment.status = 'authorised' and v_payment.booking_id is not null then
    update public.bookings
       set payment_status = 'unpaid', version = version + 1
     where id = v_payment.booking_id
       and payment_status = 'pending';
  end if;

  return true;
end;
$$;

/**
 * An authorisation that could not be captured: it ran out at the bank, or was released
 * elsewhere. The lesson stays on and is owed for, which is what the learner is then asked for.
 */
create or replace function public.system_record_capture_failed(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or v_payment.status <> 'authorised' then
    return false;
  end if;

  update public.payments set status = 'failed' where id = p_payment_id;

  if v_payment.booking_id is not null then
    update public.bookings
       set payment_status = 'unpaid', version = version + 1
     where id = v_payment.booking_id
       and payment_status = 'pending';
  end if;

  perform private.write_audit('payment.capture_failed', 'payment', p_payment_id, v_payment.business_id, null,
    jsonb_build_object('booking_id', v_payment.booking_id, 'amount_pence', v_payment.amount_pence));
  perform private.enqueue_event('payment.failed',
    jsonb_build_object('payment_id', p_payment_id, 'booking_id', v_payment.booking_id));

  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The webhook learns two more things a payment can do.
-- ---------------------------------------------------------------------------------------

/**
 * The webhook, as in 20260914150000, with an authorisation arriving and a payment being called
 * off added.
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
  v_result jsonb;
  v_payment_id uuid;
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
      if v_booking is null then
        v_outcome := 'no_booking';
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
      select id into v_payment_id
        from public.payments
       where provider = 'stripe' and provider_ref = p_payload ->> 'id';
      v_outcome := case
        when v_payment_id is null then 'payment_unknown'
        when public.system_record_payment_cancelled(v_payment_id) then 'payment_cancelled'
        else 'cancellation_already_recorded'
      end;

    when 'payment_intent.payment_failed' then
      if v_booking is null then
        v_outcome := 'no_booking';
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

revoke all on function public.system_record_card_authorisation(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.system_authorisations_due() from public, anon, authenticated;
revoke all on function public.system_record_payment_cancelled(uuid) from public, anon, authenticated;
revoke all on function public.system_record_capture_failed(uuid) from public, anon, authenticated;
revoke all on function public.system_process_stripe_event(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.system_record_card_authorisation(text, uuid, integer) to service_role;
grant execute on function public.system_authorisations_due() to service_role;
grant execute on function public.system_record_payment_cancelled(uuid) to service_role;
grant execute on function public.system_record_capture_failed(uuid) to service_role;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
