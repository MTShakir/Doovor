-- A Business can have one subscription, so the second one is refunded (9.18, D-239).
--
-- Two browser tabs can both reach Stripe's page and both finish, in the seconds between the first
-- checkout and the event that grants Pro. Nothing before this stopped the second: the row is one
-- per Business, so the later event simply wrote its own subscription id over the first, leaving
-- the first subscription billing a card every month with nothing in our database pointing at it.
--
-- So the second is recognised here and refused, and the app gives the money back. Which one is
-- "the second" is decided by what the row already holds: whatever is recorded and carrying Pro is
-- the one that is kept, and anything else arriving for the same customer is the duplicate. That
-- rule needs no clock and no ordering, which matters because webhook deliveries have neither.
--
-- Refusing is the whole of what this function does about it. Cancelling and refunding happen in
-- the app, because they are calls to Stripe, and are reported back here as an audit row.

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
  v_customer text := p_payload ->> 'customerId';
  v_status public.subscription_status;
  v_row public.subscriptions;
  v_months integer;
  v_extra jsonb := '{}'::jsonb;
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
      v_status := (p_payload ->> 'status')::public.subscription_status;

      select * into v_row from public.subscriptions
       where stripe_subscription_id = v_subscription or stripe_customer_id = v_customer
       order by (stripe_subscription_id = v_subscription) desc
       limit 1;

      if v_row.id is not null
         and v_row.stripe_subscription_id is not null
         and v_row.stripe_subscription_id is distinct from v_subscription
         and v_row.status in ('trialing', 'active', 'past_due')
         and v_status in ('trialing', 'active', 'past_due')
      then
        -- A second live subscription for a Business that already has one. The row is not touched:
        -- what it holds is the one being kept, and this one is handed back to the app to undo.
        v_outcome := 'duplicate_subscription';
        v_extra := jsonb_build_object(
          'duplicateSubscriptionId', v_subscription,
          'keptSubscriptionId', v_row.stripe_subscription_id,
          'customerId', v_row.stripe_customer_id,
          'businessId', v_row.business_id
        );
        perform private.write_audit('subscription.refunded', 'business', v_row.business_id, v_row.business_id,
          jsonb_build_object('subscription', v_row.stripe_subscription_id),
          jsonb_build_object('duplicate', v_subscription, 'outcome', 'refund_asked_for'));
      else
        v_business := public.system_record_subscription(
          v_subscription,
          v_customer,
          v_status,
          (p_payload ->> 'interval')::public.billing_interval,
          (p_payload ->> 'periodEnd')::timestamptz,
          coalesce((p_payload ->> 'cancelAtPeriodEnd')::boolean, false)
        );
        v_outcome := case when v_business is null then 'subscription_unknown' else 'subscription_recorded' end;
      end if;

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
        if v_business is not null then
          v_extra := jsonb_build_object(
            'subscriptionId', v_subscription,
            'interval', v_row.billing_interval,
            'monthsBefore', v_row.months_paid,
            'monthsAfter', v_row.months_paid + v_months
          );
        end if;
      end if;

    else
      -- Recorded and ignored, which is how an event type nobody has taught this function fails
      -- safely: it is answered 200 and never seen again, and it changed nothing.
      v_outcome := 'recorded';
  end case;

  update public.provider_events
     set processed_at = now(), outcome = v_outcome
   where id = v_id;

  return jsonb_build_object('applied', true, 'outcome', v_outcome) || v_extra;
end;
$$;

comment on function public.system_process_billing_event(text, text, jsonb) is
  'Records and applies one Stripe Billing event, exactly once, refusing a second subscription (9.18, D-235, D-238, D-239).';

revoke all on function public.system_process_billing_event(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_process_billing_event(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------
-- system_record_subscription_refund: what undoing the duplicate actually gave back.
-- ---------------------------------------------------------------------------------------
-- Written after the app has asked Stripe, so the audit trail says what was returned rather than
-- what we meant to return. It changes no subscription: the duplicate was never in a row.
create or replace function public.system_record_subscription_refund(
  p_business_id uuid,
  p_duplicate_subscription_id text,
  p_refunded_pence integer,
  p_credit_restored_pence integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.businesses where id = p_business_id) then
    return false;
  end if;

  perform private.write_audit('subscription.refunded', 'business', p_business_id, p_business_id,
    null,
    jsonb_build_object(
      'duplicate', p_duplicate_subscription_id,
      'outcome', 'refunded',
      'refunded_pence', greatest(coalesce(p_refunded_pence, 0), 0),
      'credit_restored_pence', greatest(coalesce(p_credit_restored_pence, 0), 0)
    ));
  return true;
end;
$$;

comment on function public.system_record_subscription_refund(uuid, text, integer, integer) is
  'Writes what refunding a second subscription gave back (9.18, D-239).';

revoke all on function public.system_record_subscription_refund(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.system_record_subscription_refund(uuid, text, integer, integer) to service_role;
