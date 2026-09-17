-- Finding a person, suspending or reactivating their account, and resetting their two-step
-- verification (ADM-02, M5-18).
--
-- Platform staff past their second step find instructors and learners by name, email, mobile, and
-- for an instructor their badge number, and open anybody to see their account, the Businesses they
-- work for or learn with, and whether two-step verification is on. A super admin suspends an
-- account, saying why: Supabase Auth then refuses every way of signing in and every token refresh,
-- the person is signed out everywhere at once, and the database refuses any session of theirs that
-- slipped in between. A super admin also resets somebody's two-step verification, which removes
-- their authenticator and signs them out, so they set it up again next time. Neither is done to
-- oneself, and nobody on the platform staff is suspended from here (D-126).

/** Why an account is suspended, by whom and since when. Staff read it; nobody writes it but the function below. */
create table public.account_suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended_at timestamptz not null default now(),
  suspended_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 500)
);

alter table public.account_suspensions enable row level security;

create policy account_suspensions_staff_read on public.account_suspensions
  for select to authenticated
  using ((select private.auth_is_staff()));

revoke all on public.account_suspensions from authenticated, anon;
grant select on public.account_suspensions to authenticated;

-- ---------------------------------------------------------------------------------------
-- A suspended account's sessions end with it (D-041).
-- ---------------------------------------------------------------------------------------

create or replace function private.check_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session_id text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id';
begin
  -- Anonymous and service requests carry no session.
  if v_session_id is null then
    return;
  end if;

  if not exists (
    select 1
      from auth.sessions s
      join auth.users u on u.id = s.user_id
     where s.id = v_session_id::uuid
       and (s.not_after is null or s.not_after > now())
       -- Suspending signs somebody out everywhere; this also refuses a session begun a moment
       -- before, while Auth refuses any new one (ADM-02, D-126).
       and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'SESSION_ENDED',
        'message', 'This device has been signed out.',
        'details', null,
        'hint', null
      )::text,
      detail = json_build_object('status', 401, 'headers', json_build_object())::text;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Finding and opening a person, for platform staff.
-- ---------------------------------------------------------------------------------------

/**
 * Instructors for platform staff to find (ADM-02): by the name on their profile or account, their
 * email, mobile, badge number or profile address. Newest first, and the newest when nothing is typed.
 */
create or replace function public.admin_instructors(p_query text default null, p_limit integer default 25)
returns table (
  user_id uuid,
  instructor_id uuid,
  display_name text,
  account_name text,
  email text,
  business_id uuid,
  business_name text,
  verification_status public.verification_status,
  suspended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text := private.contains_pattern(nullif(btrim(coalesce(p_query, '')), ''));
  v_digits text := private.phone_digits(p_query);
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;

  return query
    select i.user_id,
           i.id,
           i.display_name,
           u.full_name,
           u.email,
           b.id,
           b.name,
           i.verification_status,
           exists (select 1 from public.account_suspensions s where s.user_id = i.user_id)
      from public.instructor_profiles i
      join public.users u on u.id = i.user_id
      join public.businesses b on b.id = i.business_id
     where v_query is null
        or i.display_name ilike v_pattern
        or u.full_name ilike v_pattern
        or u.email ilike v_pattern
        or i.badge_number ilike v_pattern
        or i.public_slug ilike v_pattern
        or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
     order by i.created_at desc, i.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

revoke all on function public.admin_instructors(text, integer) from public, anon;
grant execute on function public.admin_instructors(text, integer) to authenticated;

/** Learners for platform staff to find (ADM-02): by name, email or mobile, newest first. */
create or replace function public.admin_learners(p_query text default null, p_limit integer default 25)
returns table (
  user_id uuid,
  name text,
  email text,
  businesses integer,
  suspended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text := private.contains_pattern(nullif(btrim(coalesce(p_query, '')), ''));
  v_digits text := private.phone_digits(p_query);
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;

  return query
    select l.user_id,
           u.full_name,
           u.email,
           (select count(*)::integer from public.learner_relationships r where r.learner_id = l.user_id),
           exists (select 1 from public.account_suspensions s where s.user_id = l.user_id)
      from public.learner_profiles l
      join public.users u on u.id = l.user_id
     where v_query is null
        or u.full_name ilike v_pattern
        or u.email ilike v_pattern
        or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
     order by u.created_at desc, u.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

revoke all on function public.admin_learners(text, integer) from public, anon;
grant execute on function public.admin_learners(text, integer) to authenticated;

/**
 * One person as platform staff see them (ADM-02): their account, whether two-step verification is
 * on, their staff role, the Businesses they work for and learn with, and any suspension. Null for
 * somebody who does not exist.
 */
create or replace function public.admin_person(p_user_id uuid)
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
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'user_id', u.id,
           'name', u.full_name,
           'email', u.email,
           'phone', u.phone,
           'created_at', u.created_at,
           'last_sign_in_at', a.last_sign_in_at,
           'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           'staff_role', (select s.role from public.platform_staff s where s.user_id = u.id),
           'suspension', case when x.user_id is null then null else jsonb_build_object(
             'at', x.suspended_at,
             'reason', x.reason,
             'by_name', (select b.full_name from public.users b where b.id = x.suspended_by)
           ) end,
           'memberships', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'business_id', b.id,
                          'business_name', b.name,
                          'business_status', b.status,
                          'role', m.role,
                          'active', m.status = 'active'
                        )
                        order by b.name
                      )
                 from public.memberships m
                 join public.businesses b on b.id = m.business_id
                where m.user_id = u.id
             ),
             '[]'::jsonb
           ),
           'learns_with', coalesce(
             (
               select jsonb_agg(jsonb_build_object('business_id', b.id, 'business_name', b.name) order by b.name)
                 from public.learner_relationships r
                 join public.businesses b on b.id = r.business_id
                where r.learner_id = u.id
             ),
             '[]'::jsonb
           )
         )
    into v_result
    from public.users u
    join auth.users a on a.id = u.id
    left join public.account_suspensions x on x.user_id = u.id
   where u.id = p_user_id;

  return v_result;
end;
$$;

revoke all on function public.admin_person(uuid) from public, anon;
grant execute on function public.admin_person(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Suspending an account, and resetting two-step verification.
-- ---------------------------------------------------------------------------------------

/**
 * A super admin past their second step suspends somebody's account, saying why, or reactivates it
 * (ADM-02, D-126). Not their own, and not anybody on the platform staff. Audited either way.
 */
create or replace function public.admin_set_account_suspended(p_user_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_suspension public.account_suspensions;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_suspended is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "suspended"}';
  end if;
  -- One change to an account at a time.
  perform 1 from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "yourself"}';
  end if;

  select * into v_suspension from public.account_suspensions where user_id = p_user_id;

  if p_suspended then
    if exists (select 1 from public.platform_staff s where s.user_id = p_user_id) then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "staff"}';
    end if;
    if v_reason is null or char_length(v_reason) > 500 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
    end if;
    if v_suspension.user_id is not null then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_suspended"}';
    end if;

    insert into public.account_suspensions (user_id, suspended_by, reason) values (p_user_id, v_user, v_reason);
    -- Auth refuses a password, a link, a code, Google, Apple and a token refresh alike while this is
    -- in the future (the same column its own ban sets).
    update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = p_user_id;
    -- Signed out everywhere, at once (D-041).
    delete from auth.sessions where user_id = p_user_id;
    perform private.write_audit('account.suspended', 'user', p_user_id, null, null, jsonb_build_object('reason', v_reason));
  else
    if v_suspension.user_id is null then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_suspended"}';
    end if;

    delete from public.account_suspensions where user_id = p_user_id;
    update auth.users set banned_until = null, updated_at = now() where id = p_user_id;
    perform private.write_audit('account.reactivated', 'user', p_user_id, null,
      jsonb_build_object('reason', v_suspension.reason, 'suspended_at', v_suspension.suspended_at), null);
  end if;
end;
$$;

revoke all on function public.admin_set_account_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_account_suspended(uuid, boolean, text) to authenticated;

/**
 * A super admin past their second step resets somebody else's two-step verification (ADM-02,
 * AUTH-08, D-126): their authenticator is removed and they are signed out everywhere, so the next
 * sign-in sets it up again. Audited (NFR-SEC-06).
 */
create or replace function public.admin_reset_two_step(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_factors integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  perform 1 from auth.users where id = p_user_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "yourself"}';
  end if;

  select count(*)::integer into v_factors from auth.mfa_factors where user_id = p_user_id;
  if v_factors = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "no_two_step"}';
  end if;

  delete from auth.mfa_factors where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  perform private.write_audit('account.two_step_reset', 'user', p_user_id, null,
    jsonb_build_object('factors', v_factors), null);
end;
$$;

revoke all on function public.admin_reset_two_step(uuid) from public, anon;
grant execute on function public.admin_reset_two_step(uuid) to authenticated;
