-- A school moves a learner between instructors, and the history stays (LRN-06, M2-10).
begin;
select plan(9);

select tests.create_fixture();

\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- Lee is taught by Ian at the school. The manager hands him to Ivy.
select tests.authenticate_as(:'manager_user');
select public.assign_learner(:'lee', :'ivy') as link \gset

select is(
  (select instructor_id from public.learner_relationships where id = :'link'),
  :'ivy'::uuid,
  'the learner is handed to the other instructor'
);
select is(
  (select business_id from public.learner_relationships where id = :'link'),
  :'school'::uuid,
  'in the same Business, because that is where the manager works'
);
select is(
  (select public.assign_learner(:'lee', :'ivy')),
  :'link'::uuid,
  'handing them to the instructor they already have changes nothing'
);

-- The instructor who has just lost them can still read the story of it.
select tests.authenticate_as(:'ivy_user');
select is(
  (select action from public.learner_history(:'lee') limit 1),
  'learner.reassigned',
  'the learner history says what happened'
);
select is(
  (select (before ->> 'instructor_name') || ' to ' || (after ->> 'instructor_name')
     from public.learner_history(:'lee') limit 1),
  'Ian to Ivy',
  'with the names as they were that day'
);
select is(
  (select actor_name from public.learner_history(:'lee') limit 1),
  'Mia Manager',
  'and who did it'
);

-- Nobody outside that Business.
select tests.authenticate_as(:'asha_user');
select is(
  (select count(*)::int from public.learner_history(:'lee')),
  0,
  'an instructor in another Business sees none of the school history'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  $$ select public.assign_learner('c0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'an instructor cannot take a learner back for themselves'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  $$ select public.assign_learner('c0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001') $$,
  '42501', null, 'and a learner cannot choose their own instructor this way'
);

select * from finish();
rollback;
