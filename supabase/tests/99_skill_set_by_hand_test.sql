-- A skill set on the map by hand, from the learner's progress page (PRG-02, PRG-03, D-169).
begin;
select plan(13);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set owner_user 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- ---------------------------------------------------------------------------------------
-- Ian teaches Lee at the school, and sets Moving off to 3.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.rate_skill(%L, 'MOVEOFF', 3) $$, :'lee'),
  'the instructor who teaches the learner sets a skill on the map'
);
select is(
  (select rating::int from public.skill_progress where learner_id = :'lee' and skill_code = 'MOVEOFF'),
  3,
  'and the map shows it at once'
);

-- Set again, the later one is where they are.
select public.rate_skill(:'lee', 'MOVEOFF', 4);
select is(
  (select rating::int from public.skill_progress where learner_id = :'lee' and skill_code = 'MOVEOFF'),
  4,
  'set again, the map takes the latest'
);
select is(
  (select times from public.skill_progress where learner_id = :'lee' and skill_code = 'MOVEOFF'),
  2,
  'and counts both'
);

-- ---------------------------------------------------------------------------------------
-- What is refused.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.rate_skill(%L, 'MOVEOFF', 6) $$, :'lee'),
  'P0001', 'VALIDATION_FAILED', 'a rating is 1 to 5'
);
select throws_ok(
  format($$ select public.rate_skill(%L, 'FLYING', 3) $$, :'lee'),
  'P0001', 'VALIDATION_FAILED', 'on an area of the test report'
);
select throws_ok(
  format($$ insert into public.skill_assessments (business_id, learner_id, skill_code, rating) values ('bbbb0000-0000-0000-0000-000000000000', %L, 'CTRL', 5) $$, :'lee'),
  '42501', null, 'and only through the function that checks who is setting it'
);

select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.rate_skill(%L, 'CTRL', 5) $$, :'lee'),
  '42501', 'NOT_ALLOWED', 'an instructor who does not teach the learner cannot set theirs'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.rate_skill(%L, 'CTRL', 5) $$, :'lee'),
  '42501', 'NOT_ALLOWED', 'nor can the learner set their own'
);

-- ---------------------------------------------------------------------------------------
-- The school's owner may, and the learner sees it, on the map and in their export.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'owner_user');
select lives_ok(
  format($$ select public.rate_skill(%L, 'CTRL', 2) $$, :'lee'),
  'the owner of the school the learner is with sets one too'
);

select tests.authenticate_as(:'lee');
select is(
  (select rating::int from public.skill_progress where learner_id = :'lee' and skill_code = 'MOVEOFF'),
  4,
  'the learner sees where they are on their own map'
);
select is(
  (select jsonb_array_length(public.export_my_data() -> 'learner' -> 'skill_updates')),
  3,
  'and every skill set by hand is in their export'
);

-- Somebody else's learner is none of Asha's business at the school.
select tests.authenticate_as(:'asha_user');
select is(
  (select count(*)::int from public.skill_assessments where business_id = 'bbbb0000-0000-0000-0000-000000000000'),
  0,
  'another Business does not see what the school set'
);

select * from finish();
rollback;
