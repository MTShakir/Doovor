-- Viewing as somebody else, read only (ADM-06, NFR-SEC-06, M5-21).
--
-- Everything that writes comes first: once a request is viewing as somebody, the rest of its
-- transaction is read only, which is the point, and this test runs in one transaction.
begin;
select plan(24);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set support 'e0000000-0000-0000-0000-000000000061'
\set other_staff 'e0000000-0000-0000-0000-000000000062'
\set support_session 'e6100000-0000-0000-0000-000000000001'
\set support_phone_session 'e6100000-0000-0000-0000-000000000002'

select tests.create_user_with_id(:'support', 'support.viewing@test.local', 'Sam Support');
select tests.create_user_with_id(:'other_staff', 'other.staff@test.local', 'Olly Other');
insert into public.platform_staff (user_id, role) values (:'support', 'support_admin'), (:'other_staff', 'support_admin');
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  (:'support_session', :'support', now(), now(), 'aal2'),
  (:'support_phone_session', :'support', now(), now(), 'aal2');

-- A request from a device session, with the headers it carried.
create function tests.request_from(p_user uuid, p_session uuid, p_aal text, p_viewing uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_user, p_aal);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', p_session)::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.headers',
    case when p_viewing is null then '{}' else json_build_object('x-view-as', p_viewing)::text end, true);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Starting and stopping.
-- ---------------------------------------------------------------------------------------
select tests.request_from(:'support', :'support_session', 'aal1', null);
select throws_ok(format($$ select public.start_impersonation(%L, 'Cannot see her lessons') $$, :'lee'), '42501', null,
  'staff cannot view as anybody before their second step (AUTH-08)');
select tests.request_from(:'ben', :'support_session', 'aal2', null);
select throws_ok(format($$ select public.start_impersonation(%L, 'Curious') $$, :'lee'), '42501', null,
  'nor can anybody outside the platform staff (ADM-06)');

select tests.request_from(:'support', :'support_session', 'aal2', null);
select throws_ok(format($$ select public.start_impersonation(%L, '  ') $$, :'lee'), 'P0001', 'VALIDATION_FAILED', 'viewing as somebody says why');
select throws_ok(format($$ select public.start_impersonation(%L, 'Checking') $$, :'other_staff'), 'P0001', 'VALIDATION_FAILED',
  'nobody views as another member of the platform staff');
select throws_ok(format($$ select public.start_impersonation(%L, 'Checking') $$, :'support'), 'P0001', 'VALIDATION_FAILED', 'nor as themselves');

select public.start_impersonation(:'lou', 'Her payments page is blank') as first_viewing \gset
select public.start_impersonation(:'lee', 'He cannot see next week''s lessons') as viewing \gset
select results_eq(
  format($$ select target_user_id, ended_at is null from public.impersonation_sessions where id in (%L, %L) order by target_user_id $$, :'first_viewing', :'viewing'),
  format($$ values (%L::uuid, true), (%L::uuid, false) $$, :'lee', :'lou'),
  'starting another viewing ends the one before'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'impersonation.started' and actor_user_id = :'support' and entity_id = :'lee'
      and after ->> 'reason' = 'He cannot see next week''s lessons'),
  1,
  'the audit log says who viewed as whom, and why (NFR-SEC-06)'
);

select public.start_impersonation(:'lou', 'Checking the ending') as ended_viewing \gset
select lives_ok(format($$ select public.end_impersonation(%L) $$, :'ended_viewing'), 'staff stop viewing');
select lives_ok(format($$ select public.end_impersonation(%L) $$, :'ended_viewing'), 'and stopping again changes nothing');
select is(
  (select count(*)::int from public.audit_log where action = 'impersonation.ended' and entity_id = :'lou' and after ->> 'viewing' = :'ended_viewing'),
  1,
  'which is in the audit log, once'
);

-- The viewing they will use below, started again after that one ended.
select public.start_impersonation(:'lee', 'He cannot see next week''s lessons') as viewing \gset
select tests.clear_authentication();
select is((select count(*)::int from public.impersonation_sessions where target_user_id = :'lee' and ended_at is null), 1, 'one viewing running');

-- ---------------------------------------------------------------------------------------
-- Requests that name a viewing they may not use.
-- ---------------------------------------------------------------------------------------
select tests.request_from(:'support', :'support_phone_session', 'aal2', :'viewing');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'another device of the same staff member cannot use the viewing');
select tests.request_from(:'other_staff', :'support_session', 'aal2', :'viewing');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'nor can another member of staff');
select tests.request_from(:'support', :'support_session', 'aal2', :'ended_viewing');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'and a viewing that has ended is refused');
select tests.request_from(:'support', :'support_session', 'aal2', null);
select is(public.impersonation_context(), null, 'a request that names no viewing views nobody');

-- ---------------------------------------------------------------------------------------
-- Viewing as Lee, read only. The rest of this transaction is read only once this passes.
-- ---------------------------------------------------------------------------------------
-- Called as the database API calls it, as a statement of its own: inside a test's own exception
-- block the read-only mode would end with that block.
select tests.request_from(:'support', :'support_session', 'aal2', :'viewing');
select private.check_request();
select pass('the staff member''s own session views as Lee');
select is((select auth.uid()), :'lee'::uuid, 'the rest of the request is Lee''s');
select results_eq(
  $$ select v ->> 'name', v ->> 'staff_name' from (select public.impersonation_context() as v) as x $$,
  $$ values ('Lee One', 'Sam Support') $$,
  'and says so, for the banner'
);
select is((select count(*)::int from public.learner_relationships), 2, 'reading what Lee reads: his two Businesses');
select is((select count(*)::int from public.platform_staff), 0, 'and nothing only staff read');
select is(current_setting('transaction_read_only'), 'on', 'in a transaction that writes nothing');
select throws_ok(
  $$ update public.users set full_name = 'Changed by support' where id = auth.uid() $$,
  '25006', null, 'a change to Lee''s own details is refused (ADM-06)'
);
select throws_ok(
  $$ select public.revoke_my_session(gen_random_uuid()) $$,
  '25006', null, 'and so is signing one of his devices out, or anything else that writes'
);
select throws_ok(
  format($$ select public.end_impersonation(%L) $$, :'viewing'),
  '25006', null, 'even stopping, which the app does from the staff member''s own requests'
);

select * from finish();
rollback;
