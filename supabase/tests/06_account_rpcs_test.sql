-- Account bootstrap (AUTH-03, PRD 9.18 founding offer) and self-service security (AUTH-09).
begin;
select plan(20);

select tests.create_user('asha@test.local', 'Asha Khan') as asha \gset
select tests.create_user('ben@test.local', 'Ben Owner') as ben \gset
select tests.create_user('cara@test.local', 'Cara Late') as cara \gset

-- Independent instructor
select tests.authenticate_as(:'asha');
select lives_ok($$ select public.create_business('independent', 'Asha Driving') $$, 'an instructor creates their business of one');

select tests.clear_authentication();
select results_eq(
  format($$ select b.type::text, m.role::text, b.plan::text, b.founding_offer from public.businesses b
             join public.memberships m on m.business_id = b.id where m.user_id = %L $$, :'asha'),
  $$ values ('independent', 'owner', 'pro', true) $$,
  'they own it and get Pro free under the founding offer (D-027)'
);
select ok(
  (select plan_expires_at between now() + interval '11 months' and now() + interval '13 months'
     from public.businesses b join public.memberships m on m.business_id = b.id where m.user_id = :'asha'),
  'the founding offer lasts 12 months'
);
select results_eq(
  format($$ select display_name, public_slug from public.instructor_profiles where user_id = %L $$, :'asha'),
  $$ values ('Asha Khan', 'asha-khan') $$,
  'an instructor profile is created with their name and a booking-link slug'
);
select is(
  (select intended_role::text from public.users where id = :'asha'),
  'instructor',
  'their intended role is recorded'
);
select is(
  (select count(*)::int from public.audit_log where action = 'business.created' and actor_user_id = :'asha'),
  1,
  'business creation is audited'
);

select tests.authenticate_as(:'asha');
select throws_ok(
  $$ select public.create_business('independent', 'Second Business') $$,
  'P0001', 'VALIDATION_FAILED',
  'one independent business per person'
);
select throws_ok($$ select public.create_business('school', '   ') $$, 'P0001', 'VALIDATION_FAILED', 'a business needs a name');

-- School
select tests.authenticate_as(:'ben');
select lives_ok($$ select public.create_business('school', 'Asha Driving') $$, 'a school owner creates their school');
select tests.clear_authentication();
select results_eq(
  format($$ select b.plan::text, b.slug <> 'asha-driving' from public.businesses b
             join public.memberships m on m.business_id = b.id where m.user_id = %L $$, :'ben'),
  $$ values ('school', true) $$,
  'schools get the School plan, and a clashing name still gets a unique slug'
);
select is_empty(
  format($$ select id from public.instructor_profiles where user_id = %L $$, :'ben'),
  'a school owner does not become an instructor automatically'
);

-- Founding offer runs out
update public.platform_settings set value = jsonb_set(value, '{instructor_limit}', '1') where key = 'founding_offer';
select tests.authenticate_as(:'cara');
select public.create_business('independent', 'Cara Driving');
select tests.clear_authentication();
select is(
  (select b.plan::text from public.businesses b join public.memberships m on m.business_id = b.id where m.user_id = :'cara'),
  'free',
  'after the founding places are used, new businesses start on Free'
);

select tests.authenticate_as_anon();
select throws_ok($$ select public.create_business('school', 'Anon School') $$, '42501', null, 'anonymous visitors cannot create businesses');

-- Devices (AUTH-09)
select tests.clear_authentication();
insert into auth.sessions (id, user_id, created_at, updated_at, aal, ip, user_agent) values
  ('11111111-0000-0000-0000-000000000001', :'asha', now() - interval '1 day', now() - interval '1 day', 'aal1', '203.0.113.1', 'Phone'),
  ('11111111-0000-0000-0000-000000000002', :'asha', now(), now(), 'aal1', '203.0.113.2', 'Laptop'),
  ('11111111-0000-0000-0000-000000000003', :'ben', now(), now(), 'aal1', '203.0.113.3', 'Ben laptop');

select tests.authenticate_as(:'asha');
select set_config('request.jwt.claims',
  json_build_object('sub', :'asha', 'role', 'authenticated', 'aal', 'aal1', 'session_id', '11111111-0000-0000-0000-000000000002')::text, true);
select results_eq(
  $$ select user_agent, is_current from public.list_my_sessions() $$,
  $$ values ('Laptop', true), ('Phone', false) $$,
  'people see their own devices, newest first, with the current one marked'
);
select ok(public.revoke_my_session('11111111-0000-0000-0000-000000000001'), 'they can sign out another device');
select ok(not public.revoke_my_session('11111111-0000-0000-0000-000000000003'), 'but never someone else''s');
select is((select count(*)::int from public.list_my_sessions()), 1, 'the revoked device is gone');

-- Deletion request
select is(public.request_account_deletion('Moving abroad'), public.request_account_deletion(null), 'asking twice returns the same open request');
select tests.authenticate_as(:'ben');
select is_empty($$ select id from public.deletion_requests $$, 'nobody sees another person''s deletion request');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log where action = 'account.deletion_requested' and actor_user_id = :'asha'),
  1,
  'the deletion request is audited once'
);

select * from finish();
rollback;
