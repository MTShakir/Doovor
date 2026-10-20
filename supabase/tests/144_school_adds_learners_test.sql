-- A school adds learners of its own, with an instructor or nobody yet (M9-27, D-294).
begin;
select plan(9);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set nell 'c0000000-0000-0000-0000-000000000144'
\set ned 'c0000000-0000-0000-0000-000000000145'

-- Two accounts the app has just made, nobody has claimed, and no Business has.
select tests.create_user_with_id(:'nell', 'nell@test.local', 'Nell New');
select tests.create_user_with_id(:'ned', 'ned@test.local', 'Ned New');
update auth.users set email_confirmed_at = null where id in (:'nell', :'ned');

select tests.authenticate_as(:'manager');
select lives_ok(
  format($$ select public.add_school_learner(%L, %L, %L, 'm1 1ae', 'automatic') $$, :'school', :'nell', :'ian'),
  'a manager adds a learner, with Ian'
);
select lives_ok(
  format($$ select public.add_school_learner(%L, %L, p_source => 'import') $$, :'school', :'ned'),
  'and one from a spreadsheet, with nobody yet'
);
reset role;
select is(
  (select array_agg(coalesce(instructor_id::text, 'nobody') || ' ' || source::text order by learner_id)
     from public.learner_relationships where business_id = :'school' and learner_id in (:'nell', :'ned')),
  array[:'ian' || ' manual', 'nobody import'],
  'each the school''s learner, with whom they were added'
);
select is(
  (select array[postcode, transmission::text] from public.learner_profiles where user_id = :'nell'),
  array['M1 1AE', 'automatic'],
  'with what the office knew about them'
);

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.add_school_learner(%L, %L) $$, :'school', :'nell'),
  'DUPLICATE_CONTACT',
  'nobody is added twice'
);
select throws_ok(
  format($$ select public.add_school_learner(%L, gen_random_uuid(), %L) $$, :'school', :'asha'),
  'VALIDATION_FAILED',
  'nor with an instructor who does not teach there'
);
select throws_ok(
  format($$ select public.add_school_learner(%L, 'c0000000-0000-0000-0000-000000000003') $$, :'school'),
  'NOT_FOUND',
  'nor somebody with an account of their own, who joins with a link'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.add_school_learner(%L, gen_random_uuid()) $$, :'school'),
  'NOT_ALLOWED',
  'an instructor at the school does not add the school''s learners'
);

reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'learner.added' and business_id = :'school' and entity_id is not null
      and after ->> 'learner_id' in (:'nell', :'ned')),
  2,
  'each is written down'
);

select * from finish();
rollback;
