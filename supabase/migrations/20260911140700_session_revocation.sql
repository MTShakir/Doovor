-- Signing a device out takes effect at once (AUTH-09, M0-27, D-041).
--
-- Access tokens are checked by signature alone, so a token issued to a session that has
-- since been signed out would keep working until it expires. The database API (PostgREST)
-- calls this function before every request and refuses tokens whose session has ended.
-- Signing out deletes the session row (Supabase Auth sign-out, revoke_my_session).

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
     where s.id = v_session_id::uuid
       and (s.not_after is null or s.not_after > now())
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

revoke all on function private.check_request() from public;
grant execute on function private.check_request() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request to 'private.check_request';
notify pgrst, 'reload config';
