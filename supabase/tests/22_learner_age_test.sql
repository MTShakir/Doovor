-- A learner is sixteen or over, and an instructor is told the band and not the date
-- (AUTH-06, R-16, M2-01).
begin;
select plan(8);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set other_learner 'c0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set outsider 'd0000000-0000-0000-0000-000000000001'

-- The fixture gives learner one a date of birth in 2000 and learner two a 17 year old.
select tests.authenticate_as(:'other_learner');
select lives_ok(
  format($$ insert into public.learner_private (user_id, date_of_birth)
            values (%L, (current_date - interval '16 years')::date) $$, :'other_learner'),
  'someone who turned sixteen today can start'
);

select throws_ok(
  format($$ update public.learner_private set date_of_birth = (current_date - interval '16 years' + interval '1 day')::date
             where user_id = %L $$, :'other_learner'),
  'P0001',
  'VALIDATION_FAILED',
  'and someone a day short of sixteen cannot'
);

-- Whoever writes it, the rule holds.
select tests.clear_authentication();
select throws_ok(
  format($$ update public.learner_private set date_of_birth = (current_date - interval '15 years')::date
             where user_id = %L $$, :'learner'),
  'P0001',
  'VALIDATION_FAILED',
  'the rule is on the row, not on the screen that wrote it'
);

-- R-16: the instructor sees a band.
select tests.authenticate_as(:'asha_user');
select is(
  (select count(*)::int from public.learner_private where user_id = :'learner'),
  0,
  'an instructor cannot read a date of birth at all'
);
select is(
  private.learner_age_band(:'learner'),
  '18_plus',
  'they are told the band instead'
);
-- Learner two is seventeen and taught by Ivy, not by Asha.
select tests.authenticate_as('b0000000-0000-0000-0000-000000000004');
select is(
  private.learner_age_band('c0000000-0000-0000-0000-000000000002'),
  'under_18',
  'including when the learner is under eighteen'
);

-- And only for learners they actually teach.
select tests.authenticate_as(:'outsider');
select is(
  private.learner_age_band(:'learner'),
  null,
  'someone with no connection to the learner is told nothing'
);

select tests.authenticate_as(:'learner');
select is(
  (select count(*)::int from public.learner_private where user_id = :'learner'),
  1,
  'the learner reads their own'
);

select * from finish();
rollback;
