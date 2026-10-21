-- Switching a member back on while their own Business is paused (D-292, D-312).
begin;
select plan(3);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian_own 'cccc0000-0000-0000-0000-000000000000'

-- Ian joined Bee School with a Business of his own, which paused.
insert into public.businesses (id, type, name, slug, status, paused_at, paused_for)
values (:'ian_own', 'independent', 'Ian Own Driving', 'ian-own-driving', 'paused', now(), :'school');
insert into public.memberships (business_id, user_id, role) values (:'ian_own', :'ian_user', 'owner');
insert into public.instructor_profiles (user_id, business_id, display_name) values (:'ian_user', :'ian_own', 'Ian');

select id as ian_member from public.memberships where business_id = :'school' and user_id = :'ian_user' \gset

select tests.authenticate_as(:'ben');
select public.set_member_active(:'ian_member', false);
select public.set_member_active(:'ian_member', true);
reset role;
select is((select status::text from public.memberships where id = :'ian_member'), 'active', 'switched back on while his own Business is paused');
select is((select status::text from public.businesses where id = :'ian_own'), 'paused', 'which stays paused');

-- Once he opens it again he teaches elsewhere, and stays off.
select tests.authenticate_as(:'ben');
select public.set_member_active(:'ian_member', false);
reset role;
update public.businesses set status = 'active', paused_at = null, paused_for = null where id = :'ian_own';
select tests.authenticate_as(:'ben');
select throws_ok(
  format('select public.set_member_active(%L, true)', :'ian_member'),
  'VALIDATION_FAILED',
  'not once his own Business is open again'
);
reset role;

select * from finish();
rollback;
