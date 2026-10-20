-- A learner who moves leaves the Business they move from; one who stays stays (D-292, D-305).
begin;
select plan(5);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set noor 'c0000000-0000-0000-0000-000000000146'

-- Liz and Noor learn with Asha's own business, and both are asked whether to move to Bee School.
select tests.create_user_with_id(:'noor', 'noor@test.local', 'Noor Stays');
insert into public.learner_profiles (user_id, transmission) values (:'noor', 'manual');
insert into public.learner_relationships (business_id, learner_id, instructor_id, status)
values (:'asha_biz', :'liz', :'asha', 'active'), (:'asha_biz', :'noor', :'asha', 'waiting');
insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason)
values (:'liz', :'asha_biz', :'school', :'ian', 'joined_school'), (:'noor', :'asha_biz', :'school', :'ian', 'joined_school');
select id as liz_move from public.learner_moves where learner_id = :'liz' \gset
select id as noor_move from public.learner_moves where learner_id = :'noor' \gset

select tests.authenticate_as(:'liz');
select lives_ok(format($$ select public.answer_learner_move(%L, true) $$, :'liz_move'), 'Liz moves');
select tests.authenticate_as(:'noor');
select lives_ok(format($$ select public.answer_learner_move(%L, false) $$, :'noor_move'), 'Noor stays');
reset role;

select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'liz'),
  'active',
  'Liz learns with the school now'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'asha_biz' and learner_id = :'liz'),
  'left',
  'and has left the business she moved from, which keeps her record'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'asha_biz' and learner_id = :'noor'),
  'waiting',
  'Noor, who stayed, is just as she was'
);

select * from finish();
rollback;
