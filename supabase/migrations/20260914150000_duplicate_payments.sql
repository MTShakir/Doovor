-- A lesson paid for twice gives the second payment back (R-10, R-11, PAY-07, M3-07).
--
-- Saved cards make a second payment for the same lesson easy to make by accident: a saved card
-- pressed in one tab and a new card finished in another, or a payment form left open while the
-- lesson was paid another way. Until now the second one was written down as paid and kept.
-- It is a double charge, so it goes back on its own, the same way money that arrives for a slot
-- that has gone does. The lesson keeps the payment that got there first.
--
-- These are the functions from 20260914130000 with that case added.

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

  else
    v_outcome := 'slot_gone';
    v_reason := 'The lesson was no longer held when the payment arrived';
  end if;

  if v_reason is not null then
    insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason)
    values (v_booking.business_id, v_payment_id, p_booking_id, v_booking.learner_id, 'card', p_amount_pence, v_reason)
    returning id into v_refund_id;

    perform private.write_audit('refund.requested', 'refund', v_refund_id, v_booking.business_id, null,
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id,
                         'amount_pence', p_amount_pence, 'automatic', true, 'why', v_outcome));
    perform private.enqueue_event('payment.refund',
      jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment_id, 'booking_id', p_booking_id));
  else
    perform private.write_audit('payment.received', 'payment', v_payment_id, v_booking.business_id, null,
      jsonb_build_object('booking_id', p_booking_id, 'amount_pence', p_amount_pence, 'outcome', v_outcome));
    perform private.enqueue_event('payment.received',
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));
  end if;

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'outcome', v_outcome,
                            'refund_id', v_refund_id);
end;
$$;

/**
 * The webhook, with every payment that is given back on its own named as refunded, whatever
 * the reason. The reason is on the refund.
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

revoke all on function public.system_record_card_payment(text, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.system_process_stripe_event(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_record_card_payment(text, uuid, integer, integer) to service_role;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
