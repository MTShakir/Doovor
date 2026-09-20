-- The getting-started answers (LRN-02, D-183): medication sits with the disability answer and is
-- read by the same people, the theory pass and the skipped questions sit on the profile, and a
-- learner may answer one without having answered the other.
begin;
select plan(10);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set other_user 'a0000000-0000-0000-0000-000000000002'

-- Medication on its own: no disability answer, which is no longer required for a row to exist.
select tests.authenticate_as(:'learner');
select lives_ok(
  format($$ insert into public.learner_health (user_id, takes_medication, medication_details)
            values (%L, true, 'Tablets that can make me drowsy in the morning') $$, :'learner'),
  'a learner tells us about medication without answering about a disability'
);

select is(
  (select has_disability from public.learner_health where user_id = :'learner'),
  null,
  'and the disability answer stays unanswered'
);

-- Both answers live in the one row, and neither wipes the other.
select lives_ok(
  format($$ update public.learner_health set has_disability = false where user_id = %L $$, :'learner'),
  'and they answer about a disability afterwards'
);
select is(
  (select takes_medication from public.learner_health where user_id = :'learner'),
  true,
  'without losing what they said about medication'
);

-- A row has to say something: one that answers nothing is not worth keeping.
select throws_ok(
  format($$ update public.learner_health set has_disability = null, takes_medication = null where user_id = %L $$, :'learner'),
  '23514',
  null,
  'a row that answers neither question is refused'
);

-- The theory pass and the skipped questions are theirs to set.
select lives_ok(
  format($$ update public.learner_profiles set theory_passed = true, setup_skipped = array['gearbox'] where user_id = %L $$, :'learner'),
  'a learner says they have passed the theory test, and skips a question'
);
select throws_ok(
  format($$ update public.learner_profiles set setup_skipped = array['nonsense'] where user_id = %L $$, :'learner'),
  '23514',
  null,
  'a question nobody asked cannot be skipped'
);
select tests.clear_authentication();

-- Their instructor reads both, as they read the rest of the card (D-180).
select tests.authenticate_as(:'asha_user');
select is(
  (select medication_details from public.learner_health where user_id = :'learner'),
  'Tablets that can make me drowsy in the morning',
  'their instructor reads what they said about medication'
);
select is(
  (select theory_passed from public.learner_profiles where user_id = :'learner'),
  true,
  'and whether they have passed the theory test'
);
select tests.clear_authentication();

-- Another instructor at another Business reads neither.
select tests.authenticate_as(:'other_user');
select is(
  (select count(*)::int from public.learner_health where user_id = :'learner'),
  0,
  'an instructor who does not teach them reads nothing about their health'
);
select tests.clear_authentication();

select * from finish();
rollback;
