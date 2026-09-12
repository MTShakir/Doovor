-- A week of working hours is replaced in one go, in local time (DIA-01, M1-09).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'

select tests.authenticate_as(:'asha_user');
select is(
  public.set_working_hours(:'asha', array[1,2,3,4,5]::smallint[], '09:00', '18:00'),
  5,
  'a week of five working days is written'
);
select is(
  (select count(*)::int from public.working_hours where instructor_id = :'asha'),
  5,
  'one row per day'
);
select is(
  (select start_time from public.working_hours where instructor_id = :'asha' and weekday = 1),
  '09:00'::time,
  'and the times are stored exactly as chosen, in local time (R-14)'
);

-- Setting the week again replaces it rather than adding to it.
select is(
  public.set_working_hours(:'asha', array[6,7]::smallint[], '10:00', '16:00'),
  2,
  'the week can be set again'
);
select is(
  (select count(*)::int from public.working_hours where instructor_id = :'asha'),
  2,
  'which replaces the week rather than adding to it'
);
select is(
  (select count(*)::int from public.working_hours where instructor_id = :'asha' and weekday between 1 and 5),
  0,
  'so the days that were dropped are gone'
);

-- What is refused
select throws_ok(
  format($$ select public.set_working_hours(%L, array[]::smallint[], '09:00', '18:00') $$, :'asha'),
  'P0001',
  'VALIDATION_FAILED',
  'no days is not a week'
);
select throws_ok(
  format($$ select public.set_working_hours(%L, array[1]::smallint[], '18:00', '09:00') $$, :'asha'),
  'P0001',
  'VALIDATION_FAILED',
  'and a day cannot finish before it starts'
);

-- Who may do it
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.set_working_hours(%L, array[1]::smallint[], '09:00', '18:00') $$, :'ian'),
  '42501',
  'NOT_ALLOWED',
  'one instructor does not set another instructor hours'
);
select tests.authenticate_as(:'manager_user');
select is(
  public.set_working_hours(:'ian', array[1,2]::smallint[], '08:00', '20:00'),
  2,
  'but a manager at their school does (SCH-02)'
);

select * from finish();
rollback;
