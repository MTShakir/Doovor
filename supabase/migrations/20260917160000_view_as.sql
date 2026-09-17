-- Viewing as somebody else, read only (ADM-06, NFR-SEC-06, M5-21).
--
-- Support needs to see what a person sees. Platform staff past their second step start viewing as
-- a person, saying why; the start and the end go in the audit log. While they view, every request
-- from their own session that names the viewing runs as that person, so every screen shows exactly
-- what the person would see, and runs in a read-only transaction, so nothing can be changed from
-- any screen: the database refuses the write, whatever asked for it. Viewing belongs to the one
-- device session that started it, ends by itself after 30 minutes, and never takes in another
-- member of the platform staff (D-129).

create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users (id) on delete cascade,
  -- The staff member's own Auth session: a copied cookie on another device does nothing.
  staff_session_id uuid not null,
  target_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  check (target_user_id <> staff_user_id)
);

create index impersonation_sessions_staff_idx on public.impersonation_sessions (staff_user_id, started_at desc);

alter table public.impersonation_sessions enable row level security;

create policy impersonation_sessions_staff_read on public.impersonation_sessions
  for select to authenticated
  using (staff_user_id = (select auth.uid()) and (select private.auth_is_staff()));

revoke all on public.impersonation_sessions from authenticated, anon;
grant select on public.impersonation_sessions to authenticated;

/** The Auth session a request's token belongs to, or null for a request without one. */
create or replace function private.request_session_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select private.uuid_or_null(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id');
$$;

/**
 * Platform staff past their second step start viewing as somebody, saying why (ADM-06). Ends any
 * viewing they already had, and answers the new viewing's id, which the app sends with each request.
 */
create or replace function public.start_impersonation(p_user_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := (select auth.uid());
  v_session uuid := private.request_session_id();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id uuid;
begin
  if v_staff is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() or v_session is null then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_user_id = v_staff then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "yourself"}';
  end if;
  -- Viewing as staff would open the admin portal to whoever started it.
  if exists (select 1 from public.platform_staff s where s.user_id = p_user_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "staff"}';
  end if;

  update public.impersonation_sessions
     set ended_at = now()
   where staff_user_id = v_staff and ended_at is null and expires_at > now();

  insert into public.impersonation_sessions (staff_user_id, staff_session_id, target_user_id, reason)
  values (v_staff, v_session, p_user_id, v_reason)
  returning id into v_id;

  perform private.write_audit('impersonation.started', 'user', p_user_id, null, null,
    jsonb_build_object('viewing', v_id, 'reason', v_reason));
  return v_id;
end;
$$;

revoke all on function public.start_impersonation(uuid, text) from public, anon;
grant execute on function public.start_impersonation(uuid, text) to authenticated;

/** Stops viewing, from the staff member's own requests. Audited once; stopping again changes nothing. */
create or replace function public.end_impersonation(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := (select auth.uid());
  v_view public.impersonation_sessions;
begin
  if v_staff is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  update public.impersonation_sessions
     set ended_at = now()
   where id = p_session_id and staff_user_id = v_staff and ended_at is null
  returning * into v_view;
  if v_view.id is not null then
    perform private.write_audit('impersonation.ended', 'user', v_view.target_user_id, null, null,
      jsonb_build_object('viewing', v_view.id, 'minutes', round(extract(epoch from (now() - v_view.started_at)) / 60)::integer));
  end if;
end;
$$;

revoke all on function public.end_impersonation(uuid) from public, anon;
grant execute on function public.end_impersonation(uuid) to authenticated;

/**
 * Who a request is viewing as, for the banner: nothing for an ordinary request. Answers from what the
 * request check found, so it cannot be asked about anybody else's viewing.
 */
create or replace function public.impersonation_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'viewing', v.id,
           'user_id', v.target_user_id,
           'name', t.full_name,
           'email', t.email,
           'staff_name', s.full_name,
           'expires_at', v.expires_at
         )
    from public.impersonation_sessions v
    join public.users t on t.id = v.target_user_id
    join public.users s on s.id = v.staff_user_id
   where v.id = private.uuid_or_null(current_setting('app.viewing_as', true))
     and v.ended_at is null
     and v.expires_at > now();
$$;

revoke all on function public.impersonation_context() from public, anon;
grant execute on function public.impersonation_context() to authenticated;

/**
 * Before every request to the database API (D-041): refuses a token whose session has ended or whose
 * account is suspended (D-126), and, for a request that names a viewing (ADM-06, D-129), checks the
 * viewing belongs to this staff member's own session and is still running, then runs the rest of the
 * request as the person viewed, read only.
 */
create or replace function private.check_request()
returns void
language plpgsql
-- Volatile: for a viewing, it changes the settings the rest of the request runs under.
volatile
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_session_id text := v_claims ->> 'session_id';
  v_viewing text := private.request_header('x-view-as');
  v_view public.impersonation_sessions;
begin
  -- Anonymous and service requests carry no session, and view nobody.
  if v_session_id is null then
    if v_viewing is not null then
      raise sqlstate 'PGRST' using
        message = json_build_object('code', 'VIEW_AS_ENDED', 'message', 'Viewing as somebody else has ended.', 'details', null, 'hint', null)::text,
        detail = json_build_object('status', 403, 'headers', json_build_object())::text;
    end if;
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

  if v_viewing is null then
    return;
  end if;

  select * into v_view
    from public.impersonation_sessions v
   where v.id = private.uuid_or_null(v_viewing)
     and v.staff_user_id = private.uuid_or_null(v_claims ->> 'sub')
     and v.staff_session_id = v_session_id::uuid
     and v.ended_at is null
     and v.expires_at > now();
  if v_view.id is null or not private.auth_is_staff() then
    raise sqlstate 'PGRST' using
      message = json_build_object('code', 'VIEW_AS_ENDED', 'message', 'Viewing as somebody else has ended.', 'details', null, 'hint', null)::text,
      detail = json_build_object('status', 403, 'headers', json_build_object())::text;
  end if;

  -- The rest of the request is the person's, and changes nothing.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_view.target_user_id, 'role', 'authenticated', 'aal', 'aal1', 'session_id', v_session_id, 'viewing_as', true)::text,
    true);
  perform set_config('request.jwt.claim.sub', v_view.target_user_id::text, true);
  perform set_config('app.viewing_as', v_view.id::text, true);
  perform set_config('transaction_read_only', 'on', true);
end;
$$;
