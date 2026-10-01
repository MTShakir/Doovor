-- Subscription events, applied exactly once (9.18, D-231, D-235).
--
-- The subscription functions in 20260930140745 are each correct on their own, but one of them is
-- not safe to run twice: `system_record_subscription_payment` adds to `months_paid` and marks
-- referral months spent. Stripe delivers an event at least once and sometimes three times, so
-- applying that one per delivery would hand somebody a loyalty discount they had not earned and
-- spend referral months that paid for nothing.
--
-- So billing events go the way payment events already go: recorded in `provider_events` and
-- applied in the same transaction, with the provider's own event id as the thing that makes it
-- exactly once. A second delivery finds the row there and changes nothing.
--
-- `account_id` stays null. These are events on the platform's own account, not on a connected
-- one, which is also why they arrive at a different endpoint with a different signing secret.

create or replace function public.system_process_billing_event(
  p_event_id text,
  p_event_type text,
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
  v_business uuid;
  v_subscription text := p_payload ->> 'subscriptionId';
  v_row public.subscriptions;
  v_months integer;
begin
  if p_event_id is null or char_length(btrim(p_event_id)) = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "eventId"}';
  end if;

  insert into public.provider_events (provider, event_id, event_type, account_id)
  values ('stripe', p_event_id, coalesce(p_event_type, 'unknown'), null)
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('applied', false, 'outcome', 'duplicate');
  end if;

  case p_payload ->> 'kind'
    when 'subscription' then
      v_business := public.system_record_subscription(
        v_subscription,
        p_payload ->> 'customerId',
        (p_payload ->> 'status')::public.subscription_status,
        (p_payload ->> 'interval')::public.billing_interval,
        (p_payload ->> 'periodEnd')::timestamptz,
        coalesce((p_payload ->> 'cancelAtPeriodEnd')::boolean, false)
      );
      v_outcome := case when v_business is null then 'subscription_unknown' else 'subscription_recorded' end;

    when 'invoice' then
      -- How many months the money covers is not the caller's to say: it follows from the interval
      -- we have on the row, which only a signed event ever wrote.
      select * into v_row from public.subscriptions where stripe_subscription_id = v_subscription;
      if v_row.id is null then
        v_outcome := 'subscription_unknown';
      else
        v_months := case when v_row.billing_interval = 'year' then 12 else 1 end;
        v_business := public.system_record_subscription_payment(
          v_subscription,
          (p_payload ->> 'paidPence')::integer,
          (p_payload ->> 'paidAt')::timestamptz,
          v_months,
          coalesce((p_payload ->> 'monthsCredited')::integer, 0)
        );
        v_outcome := case when v_business is null then 'subscription_unknown' else 'payment_recorded' end;
      end if;

    else
      -- Recorded and ignored, which is how an event type nobody has taught this function fails
      -- safely: it is answered 200 and never seen again, and it changed nothing.
      v_outcome := 'recorded';
  end case;

  update public.provider_events
     set processed_at = now(), outcome = v_outcome
   where id = v_id;

  return jsonb_build_object('applied', true, 'outcome', v_outcome);
end;
$$;

comment on function public.system_process_billing_event(text, text, jsonb) is
  'Records and applies one Stripe Billing event, exactly once (9.18, D-235).';

revoke all on function public.system_process_billing_event(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_process_billing_event(text, text, jsonb) to service_role;
