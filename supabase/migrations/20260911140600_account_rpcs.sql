-- Account bootstrap and self-service security RPCs (AUTH-03, AUTH-09, NFR-SEC-06).

-- ---------------------------------------------------------------------------------------
-- Slugs
-- ---------------------------------------------------------------------------------------
create or replace function private.unique_slug(p_base text, p_table text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := left(private.slugify(p_base), 60);
  v_candidate text := v_base;
  v_taken boolean;
begin
  for attempt in 1..10 loop
    if p_table = 'businesses' then
      select exists (select 1 from public.businesses where slug = v_candidate) into v_taken;
    else
      select exists (select 1 from public.instructor_profiles where public_slug = v_candidate) into v_taken;
    end if;
    if not v_taken then
      return v_candidate;
    end if;
    v_candidate := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  end loop;
  raise exception 'Could not find a free slug for %', v_base;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- create_business: the caller becomes the owner of a new Business (AUTH-03).
-- Independent instructors also get their instructor profile. The founding offer
-- (PRD 9.18, D-027) applies while places remain.
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
  v_offer jsonb;
  v_limit int;
  v_used int;
  v_plan public.plan_key := 'free';
  v_business uuid;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  if p_type = 'independent' and exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.type = 'independent'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_independent"}';
  end if;

  -- Serialise founding offer allocation so the limits cannot be overshot.
  perform pg_advisory_xact_lock(hashtext('founding_offer'));
  select value into v_offer from public.platform_settings where key = 'founding_offer';
  v_limit := coalesce((v_offer ->> case when p_type = 'school' then 'school_limit' else 'instructor_limit' end)::int, 0);
  select count(*) into v_used from public.businesses where founding_offer and type = p_type;
  if v_used < v_limit then
    v_plan := case when p_type = 'school' then 'school' else 'pro' end;
  end if;

  insert into public.businesses (type, name, slug, plan, plan_expires_at, founding_offer, created_by)
  values (
    p_type, v_name, private.unique_slug(v_name, 'businesses'), v_plan,
    case when v_plan <> 'free' then now() + make_interval(months => coalesce((v_offer ->> 'months')::int, 12)) end,
    v_plan <> 'free', v_user
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
    jsonb_build_object('type', p_type, 'plan', v_plan, 'founding_offer', v_plan <> 'free'));
  return v_business;
end;
$$;

revoke all on function public.create_business(public.business_type, text) from public, anon;
grant execute on function public.create_business(public.business_type, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Devices (AUTH-09): list your own sessions and revoke one.
-- ---------------------------------------------------------------------------------------
create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id,
         s.created_at,
         coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at),
         s.user_agent,
         host(s.ip),
         s.aal::text,
         s.id::text = ((select auth.jwt()) ->> 'session_id')
    from auth.sessions s
   where s.user_id = (select auth.uid())
   order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc;
$$;

revoke all on function public.list_my_sessions() from public, anon;
grant execute on function public.list_my_sessions() to authenticated;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  delete from auth.sessions where id = p_session_id and user_id = v_user;
  if not found then
    return false;
  end if;
  perform private.write_audit('auth.session_revoked', 'session', p_session_id, null);
  return true;
end;
$$;

revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.revoke_my_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Account deletion requests (AUTH-09). Processing with anonymisation arrives in M6.
-- ---------------------------------------------------------------------------------------
create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reason text check (char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index deletion_requests_one_open_idx on public.deletion_requests (user_id)
  where status in ('pending', 'processing');

create trigger deletion_requests_updated_at
  before update on public.deletion_requests
  for each row execute function private.set_updated_at();

alter table public.deletion_requests enable row level security;

grant select on public.deletion_requests to authenticated;

create policy deletion_requests_select_self on public.deletion_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy deletion_requests_select_staff on public.deletion_requests
  for select to authenticated
  using ((select private.auth_is_staff()));

create or replace function public.request_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select id into v_id from public.deletion_requests where user_id = v_user and status in ('pending', 'processing');
  if v_id is not null then
    return v_id;
  end if;
  insert into public.deletion_requests (user_id, reason) values (v_user, left(p_reason, 500)) returning id into v_id;
  perform private.write_audit('account.deletion_requested', 'user', v_user, null, null, jsonb_build_object('request_id', v_id));
  return v_id;
end;
$$;

revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;
