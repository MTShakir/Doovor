-- The webhook learns what a payment event means (R-11, PAY-02, M3-05).
--
-- A payment intent carries the booking it was for in its metadata, so an event can be applied
-- without a lookup table and without trusting anything the caller says about it.

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
          when (v_result ->> 'applied')::boolean then 'payment_recorded'
          else coalesce(v_result ->> 'reason', 'payment_already_recorded')
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

revoke all on function public.system_process_stripe_event(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
