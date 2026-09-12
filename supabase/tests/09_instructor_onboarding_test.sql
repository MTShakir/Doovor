-- Onboarding progress belongs to the instructor it describes (AUTH-04, M1-02).
begin;
select plan(6);

select tests.create_fixture();

-- Asha owns her own business; Ian teaches for a school. Both are mid-onboarding here.
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'

select is(
  (select onboarding_step from public.instructor_profiles where id = :'asha'),
  1::smallint,
  'a new instructor starts on the first step'
);
select ok(
  (select onboarding_completed_at is null from public.instructor_profiles where id = :'asha'),
  'and has not finished onboarding'
);

select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ update public.instructor_profiles set onboarding_step = 3 where id = %L $$, :'asha'),
  'an instructor records their own progress'
);
select is(
  (select onboarding_step from public.instructor_profiles where id = :'asha'),
  3::smallint,
  'the step is saved, so a reload resumes where they left off'
);

select throws_ok(
  format($$ update public.instructor_profiles set onboarding_step = 9 where id = %L $$, :'asha'),
  '23514',
  null,
  'there are only five steps'
);

with changed as (
  update public.instructor_profiles set onboarding_step = 2 where id = :'ian' returning 1
)
select is(
  (select count(*)::int from changed),
  0,
  'one instructor cannot move another through onboarding'
);

select * from finish();
rollback;
