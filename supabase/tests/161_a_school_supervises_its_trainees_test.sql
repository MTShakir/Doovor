-- A school supervises its trainees from its team, and only a school can (INS-04, R-18, D-342).
begin;
select plan(7);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set bee_biz 'bbbb0000-0000-0000-0000-000000000000'
\set owner_user 'b0000000-0000-0000-0000-000000000001'
\set manager_user 'b0000000-0000-0000-0000-000000000002'

-- Asha runs her own business, and is a trainee in it.
update public.instructor_profiles set qualification = 'pdi' where id = :'asha';

select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.set_supervisor(%L, true) $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'a trainee running their own business cannot supervise themselves through it'
);
select tests.clear_authentication();
select is(
  (select supervisor_business_id from public.instructor_profiles where id = :'asha'),
  null,
  'and nobody supervises her'
);

-- Ivy is a trainee at the school, which the team says.
update public.instructor_profiles set qualification = 'pdi' where id = :'ivy';

select tests.authenticate_as(:'owner_user');
select is(
  (select m ->> 'qualification' from jsonb_array_elements(public.school_team(:'bee_biz') -> 'members') m
    where m ->> 'instructor_id' = :'ivy'),
  'pdi',
  'the team says who is a trainee'
);
select is(
  (select (m ->> 'supervised')::boolean from jsonb_array_elements(public.school_team(:'bee_biz') -> 'members') m
    where m ->> 'instructor_id' = :'ivy'),
  false,
  'and that the school does not supervise her yet'
);
select tests.clear_authentication();

-- A manager may supervise her, as they manage the school's instructors.
select tests.authenticate_as(:'manager_user');
select is(public.set_supervisor(:'ivy', true), true, 'a manager takes responsibility for the trainee');
select is(
  (select (m ->> 'supervised')::boolean from jsonb_array_elements(public.school_team(:'bee_biz') -> 'members') m
    where m ->> 'instructor_id' = :'ivy'),
  true,
  'and the team says the school supervises her'
);
select tests.clear_authentication();

-- She can be booked now.
select lives_ok(
  format($$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                         buffer_minutes, status, price_pence, source)
            values (%L, %L, 'c0000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001',
                    '2026-09-17 10:00+01', '2026-09-17 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
         :'bee_biz', :'ivy'),
  'a trainee the school supervises takes bookings (R-18)'
);

select * from finish();
rollback;
