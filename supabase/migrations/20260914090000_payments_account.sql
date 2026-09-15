-- Connecting a Business to its own payments account (PAY-01, PAY-12, M3-02).
--
-- The platform never holds learner money: each Business has its own Stripe Connect Express
-- account, and cards are charged on it directly (D-011). What lives here is the link between
-- a Business and that account, and whether the account can take payments yet.
--
-- Only an owner may connect one (`manage_billing`), which is the same rule that keeps payouts
-- and billing away from a school's managers.

alter table public.businesses
  add column stripe_payouts_enabled boolean not null default false,
  add column stripe_details_submitted boolean not null default false,
  add column stripe_connected_at timestamptz;

-- One account belongs to one Business. A second Business claiming it would send its money
-- somewhere else entirely.
create unique index businesses_stripe_account_idx on public.businesses (stripe_account_id)
  where stripe_account_id is not null;

/**
 * Records the account the provider just made for this Business. Refuses to point a Business
 * at a different account than the one it already has: the money in the first one would have
 * nowhere to go.
 */
create or replace function public.set_payments_account(p_business_id uuid, p_account_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing text;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_billing') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_account_id is null or char_length(btrim(p_account_id)) not between 5 and 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "accountId"}';
  end if;

  select stripe_account_id into v_existing from public.businesses where id = p_business_id;
  if v_existing is not null and v_existing <> p_account_id then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "accountId", "reason": "already_connected"}';
  end if;

  update public.businesses
     set stripe_account_id = p_account_id,
         stripe_connected_at = coalesce(stripe_connected_at, now())
   where id = p_business_id;

  perform private.write_audit('business.payments_connected', 'business', p_business_id, p_business_id,
    jsonb_build_object('stripe_account_id', v_existing),
    jsonb_build_object('stripe_account_id', p_account_id));

  return jsonb_build_object('account_id', p_account_id);
end;
$$;

/**
 * What the provider says about an account, from the webhook or from a page that just asked.
 * Nothing here trusts the caller for the account's state: the caller is a job reading Stripe.
 */
create or replace function public.system_set_payments_state(
  p_account_id text,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_details_submitted boolean
)
returns integer
language sql
security definer
set search_path = ''
as $$
  with changed as (
    update public.businesses
       set stripe_charges_enabled = coalesce(p_charges_enabled, stripe_charges_enabled),
           stripe_payouts_enabled = coalesce(p_payouts_enabled, stripe_payouts_enabled),
           stripe_details_submitted = coalesce(p_details_submitted, stripe_details_submitted)
     where stripe_account_id = p_account_id
    returning 1
  )
  select count(*)::int from changed;
$$;

/** The same, for the page that has just read the account as the person who owns it. */
create or replace function public.set_payments_state(
  p_business_id uuid,
  p_charges_enabled boolean,
  p_payouts_enabled boolean,
  p_details_submitted boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  if not private.auth_has_permission(p_business_id, 'manage_billing') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.businesses
     set stripe_charges_enabled = coalesce(p_charges_enabled, stripe_charges_enabled),
         stripe_payouts_enabled = coalesce(p_payouts_enabled, stripe_payouts_enabled),
         stripe_details_submitted = coalesce(p_details_submitted, stripe_details_submitted)
   where id = p_business_id;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.set_payments_account(uuid, text) from public, anon;
revoke all on function public.set_payments_state(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.system_set_payments_state(text, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.set_payments_account(uuid, text) to authenticated;
grant execute on function public.set_payments_state(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.system_set_payments_state(text, boolean, boolean, boolean) to service_role;
