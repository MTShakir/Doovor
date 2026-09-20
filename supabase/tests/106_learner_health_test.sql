-- What a learner tells us about a disability (LRN-02, NFR-PRV-01, D-180).
begin;
select plan(10);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- ---------------------------------------------------------------------------------------
-- The learner writes their own answer, and nobody writes it for them.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select lives_ok(
  $$ insert into public.learner_health (user_id, has_disability, details) values ('c0000000-0000-0000-0000-000000000001', true, 'Dyslexia: written notes after a lesson help') $$,
  'a learner tells us themselves'
);
select is(
  (select details from public.learner_health where user_id = :'lee'),
  'Dyslexia: written notes after a lesson help',
  'and reads back what they wrote'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ insert into public.learner_health (user_id, has_disability, details) values (%L, true, 'Said it on the phone') $$, :'lou'),
  '42501', null, 'an instructor does not write one for a learner'
);
-- An update they may not make changes nothing at all: the policy hides the row from it.
update public.learner_health set details = 'Changed by their instructor' where user_id = :'lee';
select is(
  (select details from public.learner_health where user_id = :'lee'),
  'Dyslexia: written notes after a lesson help',
  'nor changes what a learner wrote'
);

-- ---------------------------------------------------------------------------------------
-- Who reads it: the learner, the instructor who teaches them, and the people who run the
-- Business they learn with. Nobody else.
-- ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.learner_health where user_id = :'lee'),
  1,
  'the instructor who teaches them reads it'
);

select tests.authenticate_as(:'ben');
select is(
  (select count(*)::int from public.learner_health where user_id = :'lee'),
  1,
  'and so does the owner of the school they learn with'
);

select tests.authenticate_as(:'ivy_user');
select is(
  (select count(*)::int from public.learner_health where user_id = :'lee'),
  0,
  'another instructor at the same school, who does not teach them, reads nothing'
);

select tests.authenticate_as(:'lou');
select is(
  (select count(*)::int from public.learner_health where user_id = :'lee'),
  0,
  'and neither does another learner'
);

-- ---------------------------------------------------------------------------------------
-- Taking it back, and taking it with them.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select is(
  (select public.export_my_data() #>> '{learner,health,details}'),
  'Dyslexia: written notes after a lesson help',
  'their own copy of everything holds it (NFR-PRV-03)'
);
delete from public.learner_health where user_id = :'lee';
select is(
  (select count(*)::int from public.learner_health where user_id = :'lee'),
  0,
  'and they take it off their record whenever they like'
);

select * from finish();
rollback;
