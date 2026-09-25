-- Telling another instructor about it (D-205).
--
-- Every Business gets a code. Somebody who starts a Business from a link carrying that code earns
-- the Business that sent them a month of the paid plan.
--
-- The month is recorded as earned and is applied to nothing, because nothing charges anybody yet
-- (D-022), and when it lands is the product owner's to settle. What could not wait is the part
-- that can only be collected as it happens: who came from whose link. A referral missed at sign-up
-- cannot be worked out afterwards, so this goes in first and the reward follows it.

alter table public.businesses
  add column referral_code text;

comment on column public.businesses.referral_code is
  'The code this Business shares to refer another (D-205). Eight characters, no I, O, 0 or 1.';

-- ---------------------------------------------------------------------------------------
-- new_referral_code: eight characters somebody can read off one phone and type into another.
-- ---------------------------------------------------------------------------------------
create or replace function private.new_referral_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  -- No I, O, 0 or 1: the four that get confused. Kept the same as packages/core/src/referral.ts.
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_index integer;
begin
  for attempt in 1..20 loop
    v_code := '';
    for position in 1..8 loop
      v_index := 1 + floor(random() * length(v_alphabet))::integer;
      v_code := v_code || substr(v_alphabet, v_index, 1);
    end loop;
    if not exists (select 1 from public.businesses b where b.referral_code = v_code) then
      return v_code;
    end if;
  end loop;
  -- Thirty-two to the eighth is a lot of codes; twenty misses means something else is wrong.
  raise exception 'Could not find a free referral code';
end;
$$;

revoke all on function private.new_referral_code() from public, anon, authenticated;

-- Every Business gets one however it was made, including the ones made before this.
create or replace function private.set_referral_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.referral_code is null then
    new.referral_code := private.new_referral_code();
  end if;
  return new;
end;
$$;

create trigger businesses_referral_code
  before insert on public.businesses
  for each row execute function private.set_referral_code();

update public.businesses set referral_code = private.new_referral_code() where referral_code is null;

alter table public.businesses
  alter column referral_code set not null;

create unique index businesses_referral_code_idx on public.businesses (referral_code);

-- The owner shares it, so the owner reads it. Not billing, but not everybody's either (D-123).
grant select (referral_code) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------------------
-- referrals: who came from whose link, and what it earned.
-- ---------------------------------------------------------------------------------------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_business_id uuid not null references public.businesses (id) on delete cascade,
  /** A Business is referred once, by whoever's link it arrived on first. */
  referred_business_id uuid not null unique references public.businesses (id) on delete cascade,
  /** The code as it was used, kept even if the referrer's code is ever changed. */
  code text not null,
  reward_months integer not null default 1 check (reward_months between 0 and 12),
  /** Null until billing applies it. When that is belongs with billing (D-022). */
  reward_applied_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_business_id <> referred_business_id)
);

alter table public.referrals enable row level security;

create index referrals_referrer_idx on public.referrals (referrer_business_id, created_at desc);

grant select on public.referrals to authenticated;

-- Whoever sent them reads it. The Business that arrived does not: who referred them is not
-- theirs to know, and nothing on their screens turns on it.
create policy referrals_read_referrer on public.referrals
  for select to authenticated
  using (private.auth_has_permission(referrer_business_id, 'manage_billing'));

create policy referrals_read_staff on public.referrals
  for select to authenticated
  using ((select private.auth_is_staff()));

-- ---------------------------------------------------------------------------------------
-- record_referral: called inside create_business, never from outside.
-- ---------------------------------------------------------------------------------------
create or replace function private.record_referral(p_business uuid, p_code text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_referrer uuid;
begin
  if v_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$' then
    return;
  end if;

  select b.id into v_referrer from public.businesses b where b.referral_code = v_code;
  -- A code nobody has, or their own, earns nothing and is not an error: the link was shared by
  -- somebody, and a sign-up is not the place to argue about it.
  if v_referrer is null or v_referrer = p_business then
    return;
  end if;

  insert into public.referrals (referrer_business_id, referred_business_id, code)
  values (v_referrer, p_business, v_code)
  on conflict (referred_business_id) do nothing;

  perform private.write_audit('referral.recorded', 'business', p_business, v_referrer, null,
    jsonb_build_object('code', v_code));
end;
$$;

revoke all on function private.record_referral(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- create_business, now taking the code the link carried.
-- ---------------------------------------------------------------------------------------
drop function if exists public.create_business(public.business_type, text);

create or replace function public.create_business(
  p_type public.business_type,
  p_name text,
  p_referral_code text default null
)
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

  perform private.record_referral(v_business, p_referral_code);

  perform private.write_audit('business.created', 'business', v_business, v_business, null,
    jsonb_build_object('type', p_type, 'plan', v_start.plan, 'founding_offer', v_start.founding, 'trial', v_start.trial));
  return v_business;
end;
$$;

revoke all on function public.create_business(public.business_type, text, text) from public, anon;
grant execute on function public.create_business(public.business_type, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- my_referrals: the owner's code, who has come from it, and what that has earned.
-- ---------------------------------------------------------------------------------------
create or replace function public.my_referrals(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_billing') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'code', (select b.referral_code from public.businesses b where b.id = p_business_id),
           'months_earned', coalesce((select sum(r.reward_months) from public.referrals r
                                       where r.referrer_business_id = p_business_id), 0),
           'months_applied', coalesce((select sum(r.reward_months) from public.referrals r
                                        where r.referrer_business_id = p_business_id
                                          and r.reward_applied_at is not null), 0),
           'joined', coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', r.id,
                       'name', joined.name,
                       'type', joined.type,
                       'at', r.created_at,
                       'months', r.reward_months,
                       'applied', r.reward_applied_at is not null)
                     order by r.created_at desc)
                from public.referrals r
                join public.businesses joined on joined.id = r.referred_business_id
               where r.referrer_business_id = p_business_id),
             '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.my_referrals(uuid) from public, anon;
grant execute on function public.my_referrals(uuid) to authenticated;
