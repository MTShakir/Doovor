-- Moving a learner between statuses, and the record of who moved them (LRN-05, M2-07).
begin;
select plan(10);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- Lee is in two Businesses, which is the case the function refuses to guess at. Every test
-- here uses Lou, who is in one Business only. The audit rows are counted with no session,
-- because reading the log is its own permission and this is about what was written.
select id as lou_link from public.learner_relationships where learner_id = :'lou' \gset

select tests.authenticate_as(:'ivy_user');
select is(
  (select public.set_learner_status(:'lou', 'waiting'))::text,
  'waiting',
  'the instructor who teaches them moves them'
);
select is(
  (select status::text from public.learner_relationships where learner_id = :'lou'),
  'waiting',
  'and the relationship says so'
);

select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'learner.status_changed' and entity_id = :'lou_link'),
  1,
  'every move is written down'
);
select is(
  (select (before ->> 'status') || ' to ' || (after ->> 'status')
     from public.audit_log
    where action = 'learner.status_changed' and entity_id = :'lou_link'),
  'active to waiting',
  'with what it was and what it became'
);

-- Moving somebody to where they already are changes nothing and records nothing.
select tests.authenticate_as(:'ivy_user');
select is(
  (select public.set_learner_status(:'lou', 'waiting'))::text,
  'waiting',
  'moving somebody to where they already are is not a move'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'learner.status_changed' and entity_id = :'lou_link'),
  1,
  'and is not written down twice'
);

-- A manager of the Business may move anybody in it.
select tests.authenticate_as(:'manager_user');
select is(
  (select public.set_learner_status(:'lou', 'passed'))::text,
  'passed',
  'so does the manager of the Business'
);

-- Nobody else.
select tests.authenticate_as(:'ian_user');
select throws_ok(
  $$ select public.set_learner_status('c0000000-0000-0000-0000-000000000002', 'left') $$,
  '42501', null, 'an instructor at the same school who does not teach them cannot'
);

select tests.authenticate_as(:'lou');
select throws_ok(
  $$ select public.set_learner_status('c0000000-0000-0000-0000-000000000002', 'passed') $$,
  '42501', null, 'and a learner cannot pass themselves'
);

select tests.authenticate_as(:'ivy_user');
select throws_ok(
  $$ select public.set_learner_status('c0000000-0000-0000-0000-000000000002', 'graduated') $$,
  'P0001', 'VALIDATION_FAILED', 'a status that does not exist is refused'
);

select * from finish();
rollback;
