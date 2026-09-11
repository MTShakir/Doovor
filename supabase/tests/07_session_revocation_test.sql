-- Signing a device out takes effect at once (AUTH-09, M0-27, D-041).
begin;
select plan(9);

-- Act as the user holding a token from the given session.
create function tests.use_session(p_user uuid, p_session uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1', 'session_id', p_session)::text, true);
end;
$$;

-- The refusal as the API client sees it: the JSON error body and the HTTP details.
create function tests.session_refusal() returns jsonb language plpgsql as $$
declare
  v_message text;
  v_detail text;
begin
  perform private.check_request();
  return null;
exception when sqlstate 'PGRST' then
  get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail;
  return jsonb_build_object('body', v_message::jsonb, 'http', v_detail::jsonb);
end;
$$;

select tests.create_user('dev@test.local', 'Dev Ice') as dev \gset
select gen_random_uuid() as live_session \gset
select gen_random_uuid() as other_session \gset
select gen_random_uuid() as expired_session \gset
insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after)
values
  (:'live_session', :'dev', now(), now(), 'aal1', null),
  (:'other_session', :'dev', now(), now(), 'aal1', null),
  (:'expired_session', :'dev', now() - interval '2 days', now() - interval '2 days', 'aal1', now() - interval '1 day');

select ok(
  exists (
    select 1
      from pg_db_role_setting s
      join pg_roles r on r.oid = s.setrole
     where r.rolname = 'authenticator'
       and 'pgrst.db_pre_request=private.check_request' = any (s.setconfig)
  ),
  'the database API runs private.check_request before every request'
);

select tests.authenticate_as_anon();
select lives_ok($$ select private.check_request() $$, 'anonymous requests carry no session and pass');

select tests.use_session(:'dev', :'live_session');
select lives_ok($$ select private.check_request() $$, 'a token from a live session passes');

select tests.use_session(:'dev', gen_random_uuid());
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'a token from a session that no longer exists is refused');
select is(tests.session_refusal() -> 'body' ->> 'code', 'SESSION_ENDED', 'the refusal carries a code the app recognises');
select is((tests.session_refusal() -> 'http' ->> 'status')::int, 401, 'and a 401 status');

select tests.use_session(:'dev', :'expired_session');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'a token from a session past its end time is refused');

-- Signing out another device (revoke_my_session) ends that session only.
select tests.use_session(:'dev', :'live_session');
select public.revoke_my_session(:'other_session');
select lives_ok($$ select private.check_request() $$, 'the device that signed the other out keeps working');
select tests.use_session(:'dev', :'other_session');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'the device signed out is refused straight away');

select * from finish();
rollback;
