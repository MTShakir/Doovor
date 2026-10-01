-- The loyalty discount has to reach Stripe, not just the screen (9.18, D-206, D-238).
--
-- `subscription_pricePence` works out what Pro costs from the run of months paid, and the checkout
-- is started with that figure. Nothing moved it afterwards. So somebody who subscribed in their
-- first month went on paying the full price for ever, and the promise on the plan screen that
-- "every 3 months takes another 5% off" was true of a new subscription and of nothing else.
--
-- What a period costs is not something this database can work out: the prices live in `plans.ts`.
-- So the answer carries the two numbers the app needs to work it out, the run of months before
-- this invoice and after it, and the app pushes a new price to Stripe when those two produce
-- different figures. Counting stays here; pricing stays where the prices are.

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
  'Records and applies one Stripe Billing event, exactly once, and says what the run of months became (9.18, D-235, D-238).';

revoke all on function public.system_process_billing_event(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_process_billing_event(text, text, jsonb) to service_role;
