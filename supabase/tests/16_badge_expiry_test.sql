-- Badge reminders go out once, and an expired badge comes out of search (INS-03, M1-13).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'

-- A fixed day to work from, so the test does not drift.
\set today '2026-09-12'

update public.instructor_profiles set badge_expiry = date '2026-11-11' where id = :'asha';  -- 60 days
update public.instructor_profiles set badge_expiry = date '2026-09-17' where id = :'ian';   -- 5 days
update public.instructor_profiles set badge_expiry = date '2026-09-11' where id = :'ivy';   -- yesterday

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'badge_reminders'),
  'the reminder record has row-level security'
);

-- Nobody reaches it through the API.
select tests.authenticate_as('a0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select instructor_id from public.badge_reminders $$,
  '42501',
  null,
  'and nobody can read it: reminders are a job, not a screen'
);
select tests.clear_authentication();

-- Claiming
-- Scoped to the three fixtures: the seed has instructors with badges of its own.
select is(
  (select count(*)::int from public.system_claim_badge_reminders(:'today'::date)
    where instructor_id in (:'asha', :'ian', :'ivy')),
  2,
  'two badges are close enough to warn about'
);
select is(
  (select days_before from public.badge_reminders where instructor_id = :'asha'),
  60::smallint,
  'two months out is the sixty day warning'
);
select is(
  (select days_before from public.badge_reminders where instructor_id = :'ian'),
  7::smallint,
  'five days out is the seven day warning, not all three'
);
select is(
  (select count(*)::int from public.badge_reminders where instructor_id = :'ivy'),
  0,
  'an expired badge is not reminded about: it is too late for that'
);

-- Running again the same day sends nothing.
select is(
  (select count(*)::int from public.system_claim_badge_reminders(:'today'::date)
    where instructor_id in (:'asha', :'ian', :'ivy')),
  0,
  'running the job again sends nothing: the record is what stops it'
);

-- A day where the next milestone is reached.
select is(
  (select count(*)::int from public.system_claim_badge_reminders(date '2026-10-12')
    where instructor_id in (:'asha', :'ian', :'ivy')),
  1,
  'a month later, the thirty day warning is due for the badge that is still running'
);
select is(
  (select count(*)::int from public.badge_reminders where instructor_id = :'asha'),
  2,
  'so that instructor has had two of the three'
);

-- Expiry
select ok(
  public.system_unlist_expired_badges(:'today'::date) >= 1,
  'an expired badge comes out of search'
);
select is(
  (select is_listed from public.instructor_profiles where id = :'ivy'),
  false,
  'the profile is hidden until the badge is renewed (INS-03)'
);

select * from finish();
rollback;
