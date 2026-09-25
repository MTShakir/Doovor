-- A free trial for everybody who misses a founding place (D-204).
--
-- Until now a Business created after the founding places ran out started on Free and stayed there,
-- which is a first day with no text reminders, no auto-charge and no bookkeeping: the parts of the
-- product somebody is deciding about. It now starts on the paid plan for a while.
--
-- Ninety days for the first five hundred, thirty for everybody after, both numbers in a setting so
-- the promise and the pricing page move together. The trial is recorded on the Business, because
-- what somebody was given is not a thing to work out from dates afterwards.
--
-- What ends a trial is not here. Nothing takes a plan away yet, for a founding offer either, and
-- that belongs with subscription billing in Phase 2 (D-022). The first trial given today runs to
-- the end of December 2026, so there is time; what this must not do is pretend otherwise, so the
-- screen an instructor reads says the date.

alter table public.businesses
  add column trial_given boolean not null default false;

comment on column public.businesses.trial_given is
  'Whether this Business was given a free trial when it was created (D-204). Never cleared: it is what decides who gets the longer one.';

-- Private like the rest of what a Business pays (D-123): the owner reads it through business_billing.

insert into public.platform_settings (key, value, description) values
  ('free_trial', '{"first": 500, "long_days": 90, "short_days": 30}',
   'The paid plan free for 90 days for the first 500 Businesses without a founding place, 30 days after that (D-204)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------
-- starting_plan: what a new Business starts on, in one place.
--
-- The same twenty lines were copied into the three functions that make a Business, which is how
-- three copies of a rule end up disagreeing. They call this now.
-- ---------------------------------------------------------------------------------------
create or replace function private.starting_plan(p_type public.business_type)
returns table (plan public.plan_key, expires_at timestamptz, founding boolean, trial boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_paid public.plan_key := case when p_type = 'school' then 'school'::public.plan_key else 'pro'::public.plan_key end;
  v_offer jsonb;
  v_trial jsonb;
  v_limit integer;
  v_used integer;
  v_days integer;
begin
  -- Serialise allocation so neither number can be overshot by two people signing up at once.
  perform pg_advisory_xact_lock(hashtext('founding_offer'));

  select s.value into v_offer from public.platform_settings s where s.key = 'founding_offer';
  v_limit := coalesce((v_offer ->> case when p_type = 'school' then 'school_limit' else 'instructor_limit' end)::integer, 0);
  select count(*) into v_used from public.businesses b where b.founding_offer and b.type = p_type;
  if v_used < v_limit then
    return query select v_paid,
                        now() + make_interval(months => coalesce((v_offer ->> 'months')::integer, 12)),
                        true, false;
    return;
  end if;

  select s.value into v_trial from public.platform_settings s where s.key = 'free_trial';
  select count(*) into v_used from public.businesses b where b.trial_given;
  v_days := coalesce(
    (v_trial ->> case when v_used < coalesce((v_trial ->> 'first')::integer, 0) then 'long_days' else 'short_days' end)::integer,
    0);
  if v_days > 0 then
    return query select v_paid, now() + make_interval(days => v_days), false, true;
    return;
  end if;

  -- No offer and no trial: Free, and nothing to expire.
  return query select 'free'::public.plan_key, null::timestamptz, false, false;
end;
$$;

revoke all on function private.starting_plan(public.business_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- create_business, starting the new way.
--
-- Everything else about it is as it was in D-125: a suspended owner starts nothing new, nobody
-- runs two independent Businesses, and an independent one is through onboarding as soon as it is
-- made. Only where the plan comes from has changed.
-- ---------------------------------------------------------------------------------------
create or replace function public.create_business(p_type public.business_type, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_start record;
  v_business uuid;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  -- Somebody whose Business is suspended does not start another one meanwhile (ADM-02, D-125).
  if exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.status = 'suspended'
  ) then
    raise exception 'BUSINESS_SUSPENDED';
  end if;
  if p_type = 'independent' and exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.type = 'independent'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_independent"}';
  end if;

  select * into v_start from private.starting_plan(p_type);

  insert into public.businesses (type, name, slug, plan, plan_expires_at, founding_offer, trial_given,
                                 created_by, onboarding_completed_at)
  values (
    p_type, v_name, private.unique_slug(v_name, 'businesses'),
    v_start.plan, v_start.expires_at, v_start.founding, v_start.trial, v_user,
    case when p_type = 'independent' then now() end
  )
  returning id into v_business;

  insert into public.memberships (business_id, user_id, role) values (v_business, v_user, 'owner');

  if p_type = 'independent' then
    select left(coalesce(nullif(trim(full_name), ''), v_name), 80) into v_display_name from public.users where id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_business, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'));
  end if;

  update public.users
     set intended_role = case when p_type = 'school' then 'school'::public.intended_role else 'instructor'::public.intended_role end
   where id = v_user;

  perform private.write_audit('business.created', 'business', v_business, v_business, null,
    jsonb_build_object('type', p_type, 'plan', v_start.plan, 'founding_offer', v_start.founding, 'trial', v_start.trial));
  return v_business;
end;
$$;

revoke all on function public.create_business(public.business_type, text) from public, anon;
grant execute on function public.create_business(public.business_type, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- business_billing: the owner also reads whether this is a trial, so a screen can say so.
-- ---------------------------------------------------------------------------------------
drop function if exists public.business_billing(uuid);

create or replace function public.business_billing(p_business_id uuid)
returns table (plan public.plan_key, plan_expires_at timestamptz, founding_offer boolean, trial_given boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not (private.auth_has_permission(p_business_id, 'manage_billing') or private.auth_is_staff('super')) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
    select b.plan, b.plan_expires_at, b.founding_offer, b.trial_given
      from public.businesses b
     where b.id = p_business_id;
end;
$$;

revoke all on function public.business_billing(uuid) from public, anon;
grant execute on function public.business_billing(uuid) to authenticated;
