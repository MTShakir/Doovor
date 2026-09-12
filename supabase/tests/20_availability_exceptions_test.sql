-- Time off and open slots that overlap are resolved when they are written (DIA-02, M1-17).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'

select tests.authenticate_as(:'asha_user');

-- Two blocks of time off that overlap become one.
select ok(
  public.set_availability_exception(:'asha', 'blocked', '2026-10-01 09:00+01', '2026-10-01 12:00+01', 'Car service') is not null,
  'time off is recorded'
);
select ok(
  public.set_availability_exception(:'asha', 'blocked', '2026-10-01 11:00+01', '2026-10-01 15:00+01', 'Still at the garage') is not null,
  'and so is a second block that runs into it'
);
select is(
  (select count(*)::int from public.availability_exceptions where instructor_id = :'asha' and kind = 'blocked'),
  1,
  'which leaves one block, not two'
);
select is(
  (select ends_at from public.availability_exceptions where instructor_id = :'asha' and kind = 'blocked'),
  '2026-10-01 15:00+01'::timestamptz,
  'covering both'
);

-- Blocks that only touch also join up.
select ok(
  public.set_availability_exception(:'asha', 'blocked', '2026-10-01 15:00+01', '2026-10-01 17:00+01', null) is not null,
  'a block that starts where the last one ended is added'
);
select is(
  (select count(*)::int from public.availability_exceptions where instructor_id = :'asha' and kind = 'blocked'),
  1,
  'and joins it rather than sitting beside it'
);

-- An open slot inside the time off wins, and splits it.
select ok(
  public.set_availability_exception(:'asha', 'open', '2026-10-01 12:00+01', '2026-10-01 13:00+01', null) is not null,
  'an open slot inside time off is taken as the newer instruction'
);
select is(
  (select count(*)::int from public.availability_exceptions where instructor_id = :'asha' and kind = 'blocked'),
  2,
  'so the time off is left in two pieces'
);
select is(
  (select count(*)::int from public.availability_exceptions
    where instructor_id = :'asha'
      and period && tstzrange('2026-10-01 12:00+01', '2026-10-01 13:00+01', '()')),
  1,
  'and no moment is both open and blocked'
);

-- What is refused
select throws_ok(
  format($$ select public.set_availability_exception(%L, 'blocked', '2026-10-02 12:00+01', '2026-10-02 09:00+01', null) $$, :'asha'),
  'P0001',
  'VALIDATION_FAILED',
  'time off cannot end before it starts'
);

select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.set_availability_exception(%L, 'blocked', '2026-10-03 09:00+01', '2026-10-03 12:00+01', null) $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'and one instructor cannot book time off for another'
);

-- A manager at the same school can, for their own instructors.
select tests.authenticate_as('b0000000-0000-0000-0000-000000000002');
select ok(
  public.set_availability_exception('b1000000-0000-0000-0000-000000000001', 'blocked',
    '2026-10-03 09:00+01', '2026-10-03 12:00+01', 'Training day') is not null,
  'a manager books time off for an instructor at their school'
);

select * from finish();
rollback;
