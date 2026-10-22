-- Lifting a suspension puts a paused Business back to paused (ADM-02, D-292, D-363).
begin;
select plan(5);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set super 'e1700000-0000-0000-0000-000000000001'

select tests.create_user_with_id(:'super', 'super.lifts@test.local', 'Sue Lifts');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin');

-- Asha's own Business is paused while she teaches under the school (D-292).
update public.businesses set status = 'paused', paused_at = now(), paused_for = :'school' where id = :'asha_biz';

select tests.authenticate_as(:'super', 'aal2');
select lives_ok(
  format($$ select public.admin_set_business_suspended(%L, true, 'Checking a complaint') $$, :'asha_biz'),
  'a paused Business can be suspended'
);
select lives_ok(
  format($$ select public.admin_set_business_suspended(%L, false) $$, :'asha_biz'),
  'and the suspension lifted'
);
select is(
  (select status::text from public.businesses where id = :'asha_biz'),
  'paused',
  'it goes back to paused, not active, while its owner still teaches under the school'
);

-- A Business that was not paused goes back to active, as before.
select public.admin_set_business_suspended(:'school', true, 'Checking a complaint');
select lives_ok(
  format($$ select public.admin_set_business_suspended(%L, false) $$, :'school'),
  'a Business that was not paused has its suspension lifted'
);
select is(
  (select status::text from public.businesses where id = :'school'),
  'active',
  'and goes back to active, as before'
);
select tests.clear_authentication();

select * from finish();
rollback;
