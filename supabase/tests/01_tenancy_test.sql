-- Tenancy isolation for users, businesses and memberships (NFR-SEC-01, PRD 6.2).
begin;
select plan(27);

-- ---------------------------------------------------------------------------------------
-- Setup as postgres (bypasses RLS). Business A is independent, Business B is a school.
-- ---------------------------------------------------------------------------------------
select tests.create_user('owner.a@test.local', 'Owner A') as owner_a \gset
select tests.create_user('owner.b@test.local', 'Owner B') as owner_b \gset
select tests.create_user('manager.b@test.local', 'Manager B') as manager_b \gset
select tests.create_user('instructor.b@test.local', 'Instructor B') as instructor_b \gset
select tests.create_user('outsider@test.local', 'Outsider') as outsider \gset
select tests.create_user('support@test.local', 'Support') as support \gset

insert into public.businesses (id, type, name, slug) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'independent', 'Business A', 'business-a'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'school', 'Business B', 'business-b');

insert into public.memberships (business_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :'owner_a', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :'owner_b', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :'manager_b', 'manager'),
  ('bbbbbbbb-0000-0000-0000-000000000001', :'instructor_b', 'instructor');

insert into public.platform_staff (user_id, role) values (:'support', 'support_admin');

-- ---------------------------------------------------------------------------------------
-- Owner of A
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'owner_a');

select results_eq(
  $$ select id from public.businesses $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid) $$,
  'owner A sees only business A'
);
select is_empty(
  $$ select id from public.businesses where id = 'bbbbbbbb-0000-0000-0000-000000000001' $$,
  'owner A cannot read business B by id (acceptance test 7 pattern)'
);
select is_empty(
  $$ update public.businesses set name = 'Hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id $$,
  'owner A cannot update business B'
);
select results_eq(
  $$ update public.businesses set name = 'Business A Renamed' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning name $$,
  $$ values ('Business A Renamed') $$,
  'owner A can update their own business profile'
);
select throws_ok(
  $$ update public.businesses set plan = 'pro' where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  '42501', null,
  'owner A cannot change their own plan directly'
);
select throws_ok(
  $$ insert into public.businesses (type, name, slug) values ('school', 'Sneaky', 'sneaky') $$,
  '42501', null,
  'businesses cannot be inserted directly (RPC only)'
);
select throws_ok(
  format($$ insert into public.memberships (business_id, user_id, role) values ('bbbbbbbb-0000-0000-0000-000000000001', %L, 'owner') $$, :'owner_a'),
  '42501', null,
  'nobody can grant themselves a membership'
);
select is_empty(
  format($$ select id from public.users where id = %L $$, :'owner_b'),
  'owner A cannot read a user from another business'
);
select is_empty(
  format($$ update public.users set full_name = 'Hacked' where id = %L returning id $$, :'owner_b'),
  'owner A cannot update another user'
);
select throws_ok(
  format($$ update public.users set email = 'new@test.local' where id = %L $$, :'owner_a'),
  '42501', null,
  'email changes must go through Supabase Auth'
);
select results_eq(
  format($$ update public.users set full_name = 'Owner Alpha' where id = %L returning full_name $$, :'owner_a'),
  $$ values ('Owner Alpha') $$,
  'people can update their own name'
);

-- ---------------------------------------------------------------------------------------
-- School roles (Business B)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_b');
select is(
  (select count(*)::int from public.memberships),
  3,
  'a school manager sees every membership in their school'
);
select is(
  (select count(*)::int from public.users),
  3,
  'a school manager sees their colleagues, not other businesses'
);
select ok(
  not private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'manage_billing'),
  'a school manager never manages billing or payouts (acceptance test 11)'
);
select ok(
  not private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'view_revenue'),
  'a manager does not see revenue unless the school allows it'
);
select ok(
  private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'issue_refunds'),
  'a manager can issue refunds by default (PRD 6.2)'
);

select tests.clear_authentication();
update public.memberships set permissions = '{"view_revenue": true, "manage_billing": true}'
 where user_id = :'manager_b';

select tests.authenticate_as(:'manager_b');
select ok(
  private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'view_revenue'),
  'a school can allow a manager to see revenue'
);
select ok(
  not private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'manage_billing'),
  'billing stays owner-only even if the permissions JSON says otherwise'
);

select tests.authenticate_as(:'instructor_b');
select is(
  (select count(*)::int from public.memberships),
  1,
  'a school instructor sees only their own membership'
);
select ok(
  not private.auth_has_permission('bbbbbbbb-0000-0000-0000-000000000001', 'set_prices'),
  'a school instructor cannot set prices unless allowed'
);
select is_empty(
  $$ update public.businesses set name = 'Instructor edit' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning id $$,
  'a school instructor cannot edit the business profile'
);

-- ---------------------------------------------------------------------------------------
-- Outsiders, anonymous visitors, suspended businesses
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'outsider');
select is(
  (select count(*)::int from public.businesses) + (select count(*)::int from public.memberships),
  0,
  'someone with no memberships sees no businesses or memberships'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.businesses $$,
  '42501', null,
  'anonymous visitors cannot read businesses'
);

select tests.clear_authentication();
update public.businesses set status = 'suspended' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select tests.authenticate_as(:'owner_a');
select is_empty(
  $$ update public.businesses set name = 'While suspended' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id $$,
  'a suspended business cannot edit its profile (ADM-02)'
);

-- ---------------------------------------------------------------------------------------
-- Platform staff need a second factor (AUTH-08)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal1');
select is(
  (select count(*)::int from public.businesses),
  0,
  'support staff without TOTP see no tenant data'
);
select tests.authenticate_as(:'support', 'aal2');
select is(
  (select count(*)::int from public.businesses
    where id in ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001')),
  2,
  'support staff with TOTP can read every business'
);
select is_empty(
  $$ update public.businesses set name = 'Support edit' returning id $$,
  'support staff cannot edit business profiles'
);

select * from finish();
rollback;
