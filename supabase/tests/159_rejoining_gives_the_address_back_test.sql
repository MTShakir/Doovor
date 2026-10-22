-- Somebody a school switched off who comes back by a new link gets the public address of the
-- profile they had there back, as switching them back on gives it (D-120, D-324, D-334).
begin;
select plan(5);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian_profile 'b1000000-0000-0000-0000-000000000001'

-- Ian teaches at Bee School, on the site at an address of his own.
update public.instructor_profiles set public_slug = 'ian-at-bee' where id = :'ian_profile';

-- Bee School switches him off, and his address goes with it.
select tests.authenticate_as(:'ben');
select public.set_member_active((select id from public.memberships where business_id = :'school' and user_id = :'ian'), false);
reset role;
select is((select public_slug from public.instructor_profiles where id = :'ian_profile'), null, 'switched off, his public address is withdrawn');

-- It sends him a new link, and he joins again.
select tests.authenticate_as(:'ben');
select token as ian_token from public.invite_member(:'school', 'instructor', 'link', 'Ian', null, null) \gset
select tests.authenticate_as(:'ian');
select lives_ok(format($$ select public.accept_member_invitation(%L) $$, :'ian_token'), 'he joins again by the new link');
reset role;
select is((select status::text from public.memberships where business_id = :'school' and user_id = :'ian'), 'active', 'his membership is on again');
select is(
  (select count(*)::int from public.instructor_profiles where user_id = :'ian' and business_id = :'school'),
  1,
  'with the profile he had there, not a second one'
);
select isnt((select public_slug from public.instructor_profiles where id = :'ian_profile'), null, 'which has a public address again');

select * from finish();
rollback;
