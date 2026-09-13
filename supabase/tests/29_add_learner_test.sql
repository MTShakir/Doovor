-- Adding a learner by hand (LRN-03, M2-08).
begin;
select plan(9);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

-- Liz has an account and belongs to nobody yet, which is the state of a learner whose
-- account the app has just made for them.
select tests.authenticate_as(:'asha_user');
select public.add_learner(:'asha', :'liz', 'LS1 4DY', 'automatic') as link \gset

select is(
  (select business_id from public.learner_relationships where id = :'link'),
  :'asha_biz'::uuid,
  'the learner joins the Business the instructor teaches for'
);
select is(
  (select source::text from public.learner_relationships where id = :'link'),
  'manual',
  'and it is recorded as somebody adding them by hand'
);
select is(
  (select status::text from public.learner_relationships where id = :'link'),
  'active',
  'somebody added by their instructor is already learning'
);
select is(
  (select transmission::text from public.learner_profiles where user_id = :'liz'),
  'automatic',
  'their own details are saved with them, not on the link'
);

select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log where action = 'learner.added' and entity_id = :'link'),
  1,
  'and the addition is written down'
);

-- The same person twice is the thing the screen is meant to catch.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$ select public.add_learner('a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') $$,
  '23505', null, 'adding them again is refused'
);

-- Somebody who teaches for the Business is not one of its learners.
select throws_ok(
  $$ select public.add_learner('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001') $$,
  'P0001', 'VALIDATION_FAILED', 'and neither is the instructor themselves'
);

-- Only somebody who may act for that instructor.
select tests.authenticate_as(:'outsider');
select throws_ok(
  $$ select public.add_learner('a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'a stranger cannot put a learner on somebody else list'
);

-- A manager may add to any instructor in their own Business.
select tests.authenticate_as(:'manager_user');
select lives_ok(
  $$ select public.add_learner('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003') $$,
  'a manager adds to an instructor at their school'
);

select * from finish();
rollback;
