-- Events from the payments provider, processed exactly once (R-11, ARCHITECTURE 8.4, M3-03).
--
-- Stripe delivers an event at least once, and sometimes three times. Recording the event and
-- applying it happen in the same transaction, so a crash can never mark one processed without
-- its effect, and a second delivery finds the row already there and changes nothing.

create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (char_length(provider) between 2 and 30),
  -- The provider's own id for the delivery. This is what makes it exactly once.
  event_id text not null,
  event_type text not null check (char_length(event_type) between 1 and 100),
  -- The connected account it came from, when it came from one rather than the platform.
  account_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  /** What we did about it, for somebody reading back through a problem. */
  outcome text,
  unique (provider, event_id)
);

alter table public.provider_events enable row level security;

create index provider_events_type_idx on public.provider_events (event_type, received_at desc);

-- Reachable by nobody through the API: the webhook runs as the service role, and admins read
-- it through a screen in M5 rather than directly.
create policy provider_events_no_api_access on public.provider_events
  for all to authenticated, anon using (false) with check (false);

/**
 * Records one event and applies it, in one transaction (R-11).
 *
 * Returns what happened: `duplicate` when this event has been seen before, or the outcome of
 * applying it. The caller answers the provider with 200 either way, because a duplicate is
 * not a problem: it is the provider doing what it promised.
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

  -- What each kind of event means. Payments join this list in M3-05; anything not named here
  -- is recorded and ignored, which is how a new event type fails safely.
  case p_event_type
    when 'account.updated' then
      v_changed := public.system_set_payments_state(
        coalesce(nullif(p_account_id, ''), p_payload ->> 'id'),
        (p_payload ->> 'charges_enabled')::boolean,
        (p_payload ->> 'payouts_enabled')::boolean,
        (p_payload ->> 'details_submitted')::boolean
      );
      v_outcome := case when v_changed > 0 then 'account_updated' else 'account_unknown' end;
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
