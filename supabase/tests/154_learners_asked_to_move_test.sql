-- The learners an instructor's joining asked to move, and an answer for those who cannot give one (D-292, D-322).
begin;
select plan(13);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'

-- Asha joined the school, so her own learners were asked whether to move with her. Lee signs in;
-- Lou and Liz she added by hand, and they never have.
insert into public.memberships (business_id, user_id, role) values (:'school', :'asha_user', 'instructor');
insert into public.instructor_profiles (id, user_id, business_id, display_name, badge_number)
values ('b1000000-0000-0000-0000-000000000009', :'asha_user', :'school', 'Asha', '123499');
insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source) values
  (:'asha_biz', :'lou', 'a1000000-0000-0000-0000-000000000001', 'active', 'manual'),
  (:'asha_biz', :'liz', 'a1000000-0000-0000-0000-000000000001', 'active', 'manual');
-- Somebody already the school's learner is never asked, so Lou is not one here yet.
delete from public.learner_relationships where business_id = :'school' and learner_id = :'lou';
update auth.users set last_sign_in_at = now() where id = :'lee';
insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason, status, answered_at) values
  (:'lee', :'asha_biz', :'school', 'b1000000-0000-0000-0000-000000000009', 'joined_school', 'moved', now()),
  (:'lou', :'asha_biz', :'school', 'b1000000-0000-0000-0000-000000000009', 'joined_school', 'asked', null),
  (:'liz', :'asha_biz', :'school', 'b1000000-0000-0000-0000-000000000009', 'joined_school', 'asked', null);
select id as lou_move from public.learner_moves where learner_id = :'lou' \gset
select id as liz_move from public.learner_moves where learner_id = :'liz' \gset

select tests.authenticate_as(:'asha_user');
select is(
  (select jsonb_agg(jsonb_build_object('name', m ->> 'learnerName', 'status', m ->> 'status', 'can', (m ->> 'canAnswer')::boolean))
     from jsonb_array_elements(public.my_learners_asked_to_move()) m),
  '[{"name": "Liz Three", "status": "asked", "can": false}, {"name": "Lou Two", "status": "asked", "can": false}, {"name": "Lee One", "status": "moved", "can": true}]'::jsonb,
  'the instructor sees who was asked, those still to answer first, and who can answer for themselves'
);
select is(
  (select m ->> 'toName' from jsonb_array_elements(public.my_learners_asked_to_move()) m limit 1),
  'Bee School',
  'with the school they would move to'
);

-- Lou told Asha he is coming.
select public.answer_learner_move_for(:'lou_move', true);
select is((select status::text from public.learner_moves where id = :'lou_move'), 'moved', 'the instructor says a learner who never signed in is moving');
reset role;
select is(
  (select status::text || ' with ' || instructor_id::text from public.learner_relationships where business_id = :'school' and learner_id = :'lou'),
  'active with b1000000-0000-0000-0000-000000000009',
  'and he is the school''s learner, with her'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'asha_biz' and learner_id = :'lou'),
  'left',
  'and has left her own Business, as when a learner answers for themselves'
);
select is(
  (select after ->> 'answered_for_learner' from public.audit_log where action = 'learner.moved' and entity_id = :'lou_move'),
  'true',
  'and the record says the instructor answered for him'
);

-- Liz is staying.
select tests.authenticate_as(:'asha_user');
select public.answer_learner_move_for(:'liz_move', false);
select is((select status::text from public.learner_moves where id = :'liz_move'), 'stayed', 'or that one is staying');
select throws_ok(
  format($$ select public.answer_learner_move_for(%L, true) $$, :'liz_move'),
  'P0001', 'VALIDATION_FAILED',
  'an answer once given stands'
);
reset role;

-- Somebody who signs in answers for themselves.
update public.learner_moves set status = 'asked', answered_at = null where id = :'liz_move';
update auth.users set last_sign_in_at = now() where id = :'liz';
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.answer_learner_move_for(%L, true) $$, :'liz_move'),
  'P0001', 'VALIDATION_FAILED',
  'a learner who has signed in is not answered for'
);
reset role;

select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.answer_learner_move_for(%L, true) $$, :'liz_move'),
  '42501', 'NOT_FOUND',
  'nor does anybody else answer for anyone'
);
select is(jsonb_array_length(public.my_learners_asked_to_move()), 0, 'or see who was asked');
reset role;

-- An ask to a school she does not teach under is not hers to see here.
delete from public.memberships where business_id = :'school' and user_id = :'asha_user';
select tests.authenticate_as(:'asha_user');
select is(jsonb_array_length(public.my_learners_asked_to_move()), 0, 'only for the school they teach under now');
reset role;

select ok(
  not has_function_privilege('anon', 'public.my_learners_asked_to_move()', 'execute')
    and not has_function_privilege('anon', 'public.answer_learner_move_for(uuid, boolean)', 'execute'),
  'nobody signed out reads or answers anything'
);

select * from finish();
rollback;
