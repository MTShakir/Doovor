-- Pro, paid for through the platform (9.18, D-231).
--
-- An independent instructor subscribes to Pro, monthly or yearly, and Stripe takes the money. This
-- is where that state lives. Two things about it are deliberate and are the whole of its security.
--
-- **Nothing here is writable by anybody signed in.** `authenticated` may read its own Business's
-- row and nothing else: no insert, no update, no delete, no grant. Every write comes from a
-- `system_*` function called by the Stripe webhook with the secret key, after the signature has
-- been checked. So the answer to "can somebody give themselves Pro from the browser" is that there
-- is no statement they could send that would do it, not that the screen does not offer one.
--
-- **No price is stored before it is charged.** What a subscription costs is worked out from
-- `plans.ts` and from `months_paid`, which only this file writes. Nothing takes an amount from a
-- caller. What is kept here is what Stripe actually took, after the event, so the two can be
-- compared rather than assumed equal.
--
-- Schools are not here. Pro is for an independent instructor; a school pays per instructor on the
-- School plan, which is Phase 2 (D-231).

create type public.subscription_status as enum (
  'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
);

create type public.billing_interval as enum ('month', 'year');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  /** One subscription per Business. A second one is a bug, not a second plan. */
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  /** Stripe's customer for this Business, on our own account, not a connected one. */
  stripe_customer_id text not null,
  /** Null between starting a checkout and Stripe telling us it became a subscription. */
  stripe_subscription_id text unique,
  billing_interval public.billing_interval not null,
  status public.subscription_status not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  /**
   * Months paid for in a row, which is what decides the loyalty discount (D-206). A year adds
   * twelve. Ending a subscription puts it back to nothing, because leaving starts the run again.
   */
  months_paid integer not null default 0 check (months_paid >= 0),
  /** What the last invoice actually took, in pence. Written from the event, never guessed. */
  last_paid_pence integer check (last_paid_pence >= 0),
  last_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subscriptions is 'What a Business pays for Pro, written only by the payment webhook (9.18, D-231).';

create index subscriptions_renewing_idx on public.subscriptions (current_period_end)
  where status in ('trialing', 'active') and not cancel_at_period_end;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;

-- Reading only, and only your own Business's, and only if you are the one who would be paying.
grant select on public.subscriptions to authenticated;

create policy subscriptions_read_own on public.subscriptions
  for select to authenticated
  using (private.auth_has_permission(business_id, 'manage_billing'));

create policy subscriptions_read_staff on public.subscriptions
  for select to authenticated
  using ((select private.auth_is_staff()));

-- ---------------------------------------------------------------------------------------
-- A month earned by referring somebody, and when it was earned (D-205, D-231).
-- ---------------------------------------------------------------------------------------
-- The reward is earned when the instructor who was referred is approved by staff, not when they
-- sign up: an account anybody can make is not worth a month of Pro, and a badge a person has
-- checked is. `reward_applied_at` stays what it was, the moment it came off an invoice.
alter table public.referrals add column earned_at timestamptz;

comment on column public.referrals.earned_at is
  'When the referred instructor was approved, which is what earns the month (D-231).';

-- ---------------------------------------------------------------------------------------
-- private.banked_referral_months: months earned and not yet spent.
-- ---------------------------------------------------------------------------------------
create or replace function private.banked_referral_months(p_business uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(r.reward_months), 0)::integer
    from public.referrals r
   where r.referrer_business_id = p_business
     and r.earned_at is not null
     and r.reward_applied_at is null;
$$;

comment on function private.banked_referral_months(uuid) is
  'Months earned by referring people and not yet taken off an invoice (D-205, D-231).';

grant execute on function private.banked_referral_months(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- public.my_subscription: what the plan screen reads.
-- ---------------------------------------------------------------------------------------
-- The row plus the two numbers the screen needs, which are nobody's to send: the run of months
-- that decides the discount, and the months banked from referrals.
create or replace function public.my_subscription(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_billing') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select * into v_row from public.subscriptions where business_id = p_business_id;

  return jsonb_build_object(
    'status', coalesce(v_row.status::text, 'none'),
    'billingInterval', v_row.billing_interval,
    'currentPeriodEnd', v_row.current_period_end,
    'cancelAtPeriodEnd', coalesce(v_row.cancel_at_period_end, false),
    'monthsPaid', coalesce(v_row.months_paid, 0),
    'lastPaidPence', v_row.last_paid_pence,
    'bankedMonths', private.banked_referral_months(p_business_id)
  );
end;
$$;

revoke all on function public.my_subscription(uuid) from public, anon;
grant execute on function public.my_subscription(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- system_start_subscription: the row that exists between checkout and the first event.
-- ---------------------------------------------------------------------------------------
-- Called by the Server Action that starts a checkout, through the secret key, so a row exists to
-- attach the webhook's answer to. It grants nothing: `incomplete` carries no Pro.
create or replace function public.system_start_subscription(
  p_business_id uuid,
  p_customer_id text,
  p_interval public.billing_interval
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and type = 'independent') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "businessId"}';
  end if;

  insert into public.subscriptions (business_id, stripe_customer_id, billing_interval, status)
  values (p_business_id, p_customer_id, p_interval, 'incomplete')
  on conflict (business_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        billing_interval = case
          -- An unfinished checkout may change its mind about monthly or yearly. A live one may
          -- not: that is a change of subscription and Stripe decides what it costs.
          when public.subscriptions.status = 'incomplete' then excluded.billing_interval
          else public.subscriptions.billing_interval
        end
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.system_start_subscription(uuid, text, public.billing_interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- system_record_subscription: what Stripe says a subscription is now.
-- ---------------------------------------------------------------------------------------
-- Every field comes from a signed event. The plan on the Business follows from it, so Pro is
-- something Stripe has confirmed rather than something a screen decided.
create or replace function public.system_record_subscription(
  p_subscription_id text,
  p_customer_id text,
  p_status public.subscription_status,
  p_interval public.billing_interval,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions;
begin
  select * into v_row from public.subscriptions
   where stripe_subscription_id = p_subscription_id or stripe_customer_id = p_customer_id
   order by (stripe_subscription_id = p_subscription_id) desc
   limit 1;

  if v_row.id is null then
    -- An event for a customer we have no row for: nothing to attach it to, and inventing a
    -- Business from it would be guessing whose money it is.
    return null;
  end if;

  update public.subscriptions
     set stripe_subscription_id = p_subscription_id,
         status = p_status,
         billing_interval = p_interval,
         current_period_end = p_period_end,
         cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
         -- Leaving starts the run of months again (D-206).
         months_paid = case when p_status in ('canceled', 'unpaid') then 0 else v_row.months_paid end
   where id = v_row.id;

  update public.businesses
     set plan = case when p_status in ('trialing', 'active', 'past_due') then 'pro'::public.plan_key else 'free'::public.plan_key end,
         plan_expires_at = case when p_status in ('trialing', 'active', 'past_due') then p_period_end else null end
   where id = v_row.business_id;

  perform private.write_audit('subscription.changed', 'business', v_row.business_id, v_row.business_id,
    jsonb_build_object('status', v_row.status),
    jsonb_build_object('status', p_status, 'interval', p_interval, 'period_end', p_period_end,
                       'cancel_at_period_end', coalesce(p_cancel_at_period_end, false)));

  return v_row.business_id;
end;
$$;

revoke all on function public.system_record_subscription(text, text, public.subscription_status, public.billing_interval, timestamptz, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- system_record_subscription_payment: an invoice that was actually paid.
-- ---------------------------------------------------------------------------------------
-- This is what moves the loyalty run along, and what spends banked referral months. Both happen
-- here rather than when a subscription is created, because a subscription that never pays has
-- earned nobody anything.
create or replace function public.system_record_subscription_payment(
  p_subscription_id text,
  p_paid_pence integer,
  p_paid_at timestamptz,
  p_months_covered integer,
  p_months_credited integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions;
  v_left integer := greatest(coalesce(p_months_credited, 0), 0);
  v_referral record;
begin
  select * into v_row from public.subscriptions where stripe_subscription_id = p_subscription_id;
  if v_row.id is null then
    return null;
  end if;

  update public.subscriptions
     set months_paid = months_paid + greatest(coalesce(p_months_covered, 0), 0),
         last_paid_pence = greatest(coalesce(p_paid_pence, 0), 0),
         last_paid_at = coalesce(p_paid_at, now())
   where id = v_row.id;

  -- The months that paid for part of this invoice are spent, oldest first, so somebody who
  -- referred three people uses the month they earned first.
  for v_referral in
    select r.id, r.reward_months
      from public.referrals r
     where r.referrer_business_id = v_row.business_id
       and r.earned_at is not null
       and r.reward_applied_at is null
     order by r.earned_at
  loop
    exit when v_left <= 0;
    update public.referrals set reward_applied_at = coalesce(p_paid_at, now()) where id = v_referral.id;
    v_left := v_left - v_referral.reward_months;
  end loop;

  perform private.write_audit('subscription.paid', 'business', v_row.business_id, v_row.business_id,
    null,
    jsonb_build_object('paid_pence', greatest(coalesce(p_paid_pence, 0), 0),
                       'months_covered', greatest(coalesce(p_months_covered, 0), 0),
                       'months_credited', greatest(coalesce(p_months_credited, 0), 0)));

  return v_row.business_id;
end;
$$;

revoke all on function public.system_record_subscription_payment(text, integer, timestamptz, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- private.earn_referral_month: called when an instructor is approved.
-- ---------------------------------------------------------------------------------------
-- A month is earned when a person has checked the badge, not when an account is made (D-231).
-- Approving the same instructor twice earns one month, because the row is marked the first time.
create or replace function private.earn_referral_month(p_business uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.referrals
     set earned_at = now()
   where referred_business_id = p_business
     and earned_at is null;
end;
$$;

comment on function private.earn_referral_month(uuid) is
  'Marks the referral of this Business as earned, once its instructor is approved (D-205, D-231).';

-- ---------------------------------------------------------------------------------------
-- decide_verification: approving is what earns a referral month (D-205, D-231).
-- ---------------------------------------------------------------------------------------
-- Rebuilt from its newest definition with one block added; everything else is as it was.
create or replace function public.decide_verification(
  p_profile_id uuid,
  p_approved boolean,
  p_reason text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_before jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.verification_status :=
    case when p_approved then 'approved'::public.verification_status else 'rejected'::public.verification_status end;
begin
  if not (select private.auth_is_staff()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not p_approved and v_reason is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select business_id, jsonb_build_object('verification_status', verification_status)
    into v_business, v_before
    from public.instructor_profiles
   where id = p_profile_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  update public.instructor_profiles
     set verification_status = v_status,
         verified_at = case when p_approved then now() end,
         verification_decision_reason = left(v_reason, 500),
         -- Checked, so no longer needed: the nightly job removes the picture (D-158).
         badge_path = null
   where id = p_profile_id;

  -- Approving is what earns the month somebody was promised for referring them (D-205, D-231).
  -- Not signing up: an account anybody can make is not worth a month of Pro, and a badge a person
  -- has looked at is. Rejecting earns nothing, and approving the same instructor twice earns one
  -- month, because the row is marked the first time.
  if p_approved then
    perform private.earn_referral_month(v_business);
  end if;

  perform private.write_audit(
    'instructor.verification_decided', 'instructor_profile', p_profile_id, v_business, v_before,
    jsonb_build_object('verification_status', v_status, 'reason', left(v_reason, 500))
  );

  -- The instructor is told outside this transaction (D-017). Identifiers only.
  perform private.enqueue_event(
    'instructor/verification-decided',
    jsonb_build_object('instructor_profile_id', p_profile_id, 'business_id', v_business, 'status', v_status)
  );

  return v_status;
end;
$$;