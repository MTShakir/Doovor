-- A second step somebody turned on is asked for when they sign in (AUTH-08, D-351).
begin;
select plan(4);

select tests.create_fixture();

\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- Lee, a learner, turned on two-step verification; Lou did not, and one of hers was never finished.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (gen_random_uuid(), :'lee', 'Phone', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP'),
       (gen_random_uuid(), :'lou', 'Phone', 'totp', 'unverified', now(), now(), 'JBSWY3DPEHPK3PXQ');

select tests.authenticate_as(:'lee');
select is(public.my_second_step_on(), true, 'a learner who turned it on has a second step to be asked for');
select tests.authenticate_as(:'lou');
select is(public.my_second_step_on(), false, 'one never finished does not count');
select tests.clear_authentication();

select tests.authenticate_as_anon();
select throws_ok($$ select public.my_second_step_on() $$, '42501', null, 'nobody signed out can ask');
select tests.clear_authentication();

select is(
  (select count(*)::int from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'my_second_step_on' and grantee = 'authenticated'),
  1,
  'somebody signed in asks about themselves'
);

select * from finish();
rollback;
