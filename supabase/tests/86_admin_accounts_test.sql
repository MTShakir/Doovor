-- Finding a person, suspending or reactivating their account, and resetting their two-step
-- verification (ADM-02, M5-18).
begin;
select plan(42);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set super 'e0000000-0000-0000-0000-000000000030'
\set support 'e0000000-0000-0000-0000-000000000031'

select tests.create_user_with_id(:'super', 'super.accounts@test.local', 'Sue Super');
select tests.create_user_with_id(:'support', 'support.accounts@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin'), (:'support', 'support_admin');

-- Lee has a mobile and is signed in on two devices; Ben has an authenticator app and one device.
update public.users set phone = '447700922333' where id = :'lee';
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  (gen_random_uuid(), :'lee', now(), now(), 'aal1'),
  (gen_random_uuid(), :'lee', now(), now(), 'aal1'),
  (gen_random_uuid(), :'ben', now(), now(), 'aal2');
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (gen_random_uuid(), :'ben', 'Phone', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP');

-- Act as somebody holding a token from the given session (as in 07_session_revocation_test.sql).
create function tests.use_session(p_user uuid, p_session uuid) returns void language plpgsql as $$
begin
  perform tests.authenticate_as(p_user);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', 'aal1', 'session_id', p_session)::text, true);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Finding a person, and who may look.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select results_eq(
  $$ select user_id, display_name, account_name, business_name, verification_status::text, suspended
       from public.admin_instructors('Ian On') $$,
  format($$ values (%L::uuid, 'Ian', 'Ian One', 'Bee School', 'unsubmitted', false) $$, :'ian_user'),
  'support staff find an instructor by their account name, with where they teach (ADM-02)'
);
select results_eq(
  $$ select display_name from public.admin_instructors('234567') $$,
  $$ values ('Ian') $$,
  'or by their badge number'
);
select results_eq(
  $$ select name, email, businesses, suspended from public.admin_learners('LEARNER.1@test') $$,
  $$ values ('Lee One', 'learner.1@test.local', 2, false) $$,
  'and a learner by their email, with how many Businesses they learn with'
);
select results_eq(
  $$ select name from public.admin_learners('+44 7700 922333') $$,
  $$ values ('Lee One') $$,
  'or by their mobile'
);
select ok(
  (select count(*) from public.admin_learners(null)) between 3 and 25
    and (select count(*) from public.admin_instructors(null)) between 3 and 25,
  'with nothing typed, the newest, 25 at most'
);
select results_eq(
  format($$ select p ->> 'name', (p ->> 'two_step')::boolean, p ->> 'staff_role', p -> 'suspension',
                  (select string_agg((m ->> 'business_name') || ':' || (m ->> 'role'), ',') from jsonb_array_elements(p -> 'memberships') as m),
                  jsonb_array_length(p -> 'learns_with')
              from (select public.admin_person(%L) as p) as x $$, :'ben'),
  $$ values ('Ben Owner', true, null::text, 'null'::jsonb, 'Bee School:owner', 0) $$,
  'support staff open a person: two-step verification, the Businesses they work for, nothing suspended'
);
select results_eq(
  format($$ select (select string_agg(b ->> 'business_name', ',' order by b ->> 'business_name') from jsonb_array_elements(p -> 'learns_with') as b)
              from (select public.admin_person(%L) as p) as x $$, :'lee'),
  $$ values ('Asha Driving,Bee School') $$,
  'and a learner, with the Businesses they learn with'
);
select is(public.admin_person(:'super') ->> 'staff_role', 'super_admin', 'and staff, with their role');
select is(public.admin_person('00000000-0000-0000-0000-000000000000'), null, 'somebody who does not exist is nothing');

select tests.authenticate_as(:'support');
select throws_ok($$ select * from public.admin_learners('Lee') $$, '42501', null, 'staff cannot look before their second step (AUTH-08)');
select throws_ok(format($$ select public.admin_person(%L) $$, :'lee'), '42501', null, 'nor open a person');
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok($$ select * from public.admin_instructors('Ian') $$, '42501', null, 'and a school owner cannot look at all');

-- ---------------------------------------------------------------------------------------
-- Suspending an account.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Abusive messages') $$, :'lee'),
  '42501', null, 'support staff cannot suspend an account'
);
select tests.authenticate_as(:'super');
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Abusive messages') $$, :'lee'),
  '42501', null, 'nor a super admin before their second step'
);
select tests.authenticate_as(:'super', 'aal2');
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Testing') $$, :'super'),
  'P0001', 'VALIDATION_FAILED', 'a super admin cannot suspend themselves'
);
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Testing') $$, :'support'),
  'P0001', 'VALIDATION_FAILED', 'nor anybody on the platform staff'
);
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, ' ') $$, :'lee'),
  'P0001', 'VALIDATION_FAILED', 'a suspension says why'
);
select lives_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Abusive messages to two instructors') $$, :'lee'),
  'a super admin suspends an account'
);
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, true, 'Again') $$, :'lee'),
  'P0001', 'VALIDATION_FAILED', 'once'
);
select results_eq(
  format($$ select p -> 'suspension' ->> 'reason', p -> 'suspension' ->> 'by_name', p -> 'suspension' ->> 'at' is not null
              from (select public.admin_person(%L) as p) as x $$, :'lee'),
  $$ values ('Abusive messages to two instructors', 'Sue Super', true) $$,
  'staff see why, by whom and when'
);
select results_eq(
  $$ select suspended from public.admin_learners('learner.1@test') $$,
  $$ values (true) $$,
  'and the search says so'
);

select tests.clear_authentication();
select ok((select banned_until > now() + interval '50 years' from auth.users where id = :'lee'), 'Auth refuses them every way of signing in');
select is((select count(*)::int from auth.sessions where user_id = :'lee'), 0, 'and they are signed out everywhere at once');
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.suspended' and entity = 'user' and entity_id = :'lee' and actor_user_id = :'super'
      and after ->> 'reason' = 'Abusive messages to two instructors'),
  1,
  'in the audit log (NFR-SEC-06)'
);
select gen_random_uuid() as late_session \gset
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values (:'late_session', :'lee', now(), now(), 'aal1');
select tests.use_session(:'lee', :'late_session');
select throws_ok($$ select private.check_request() $$, 'PGRST', null, 'a session begun a moment before is refused as well');

-- ---------------------------------------------------------------------------------------
-- Reactivating it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, false) $$, :'lee'),
  '42501', null, 'support staff cannot reactivate an account'
);
select tests.authenticate_as(:'super', 'aal2');
select lives_ok(format($$ select public.admin_set_account_suspended(%L, false) $$, :'lee'), 'a super admin reactivates it');
select throws_ok(
  format($$ select public.admin_set_account_suspended(%L, false) $$, :'lee'),
  'P0001', 'VALIDATION_FAILED', 'once'
);
select tests.clear_authentication();
select is((select banned_until from auth.users where id = :'lee'), null, 'Auth lets them sign in again');
select is((select count(*)::int from public.account_suspensions where user_id = :'lee'), 0, 'with the suspension gone');
select is(
  (select count(*)::int from public.audit_log where action = 'account.reactivated' and entity_id = :'lee' and actor_user_id = :'super'),
  1,
  'in the audit log too'
);
select tests.use_session(:'lee', :'late_session');
select lives_ok($$ select private.check_request() $$, 'and a session of theirs works again');

-- ---------------------------------------------------------------------------------------
-- Resetting two-step verification.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok(format($$ select public.admin_reset_two_step(%L) $$, :'ben'), '42501', null, 'support staff cannot reset two-step verification');
select tests.authenticate_as(:'super', 'aal2');
select throws_ok(format($$ select public.admin_reset_two_step(%L) $$, :'super'), 'P0001', 'VALIDATION_FAILED', 'a super admin cannot reset their own');
select lives_ok(format($$ select public.admin_reset_two_step(%L) $$, :'ben'), 'a super admin resets somebody else''s');
select throws_ok(
  format($$ select public.admin_reset_two_step(%L) $$, :'ben'),
  'P0001', 'VALIDATION_FAILED', 'and there is nothing to reset once it is done'
);
select tests.clear_authentication();
select is((select count(*)::int from auth.mfa_factors where user_id = :'ben'), 0, 'their authenticator app no longer works for the account');
select is((select count(*)::int from auth.sessions where user_id = :'ben'), 0, 'they are signed out everywhere');
select is(
  (select count(*)::int from public.audit_log where action = 'account.two_step_reset' and entity_id = :'ben' and actor_user_id = :'super'),
  1,
  'and the audit log says who reset it'
);

-- ---------------------------------------------------------------------------------------
-- Suspensions are for staff to read.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'super', 'aal2');
select public.admin_set_account_suspended(:'lou', true, 'Chargebacks on three cards');
select tests.authenticate_as(:'lou');
select is((select count(*)::int from public.account_suspensions), 0, 'a suspended person cannot read why');
select tests.authenticate_as(:'ben', 'aal2');
select is((select count(*)::int from public.account_suspensions), 0, 'nor can anybody else signed in');
select tests.authenticate_as(:'support', 'aal2');
select is((select count(*)::int from public.account_suspensions where user_id = :'lou'), 1, 'but platform staff can');

select * from finish();
rollback;
