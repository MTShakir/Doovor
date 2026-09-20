-- A lesson length the instructor sets, priced at the hourly rate (BOK-03, D-179).
begin;
select plan(9);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The school sells an hour at £42 and ninety minutes at £60, and Ian charges £48 an hour himself.
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence) values
  (:'school', :'lesson_type', 60, 4200),
  (:'school', :'lesson_type', 90, 6000);
insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence) values
  (:'school', :'lesson_type', :'ian', 60, 4800);

select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ivy', 90),
  6000,
  'a length the catalogue holds keeps the price the catalogue gives it'
);
select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ivy', 150),
  10500,
  'a length it does not hold costs the hourly rate for the time it takes'
);
select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ian', 150),
  12000,
  'at the instructor''s own rate where they have one'
);
select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ian', 90),
  6000,
  'while the catalogue still wins for a length it holds'
);
select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ivy', 45),
  null,
  'a length off the half hour is no length at all'
);
select is(
  private.lesson_price_for(:'school', :'lesson_type', :'ivy', 300),
  null,
  'nor is one longer than four and a half hours'
);

-- ---------------------------------------------------------------------------------------
-- Booking one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format(
    $$ select public.create_booking(%L, %L, %L, %L::timestamptz, 150) $$,
    :'ian', :'lee', :'lesson_type', '2026-11-02T10:00:00Z'
  ),
  'an instructor books a lesson of two and a half hours'
);
select is(
  (select price_pence from public.bookings where instructor_id = :'ian' and starts_at = '2026-11-02T10:00:00Z'),
  12000,
  'and it costs their hourly rate for the time it takes, worked out by the database (R-05)'
);
select throws_ok(
  format(
    $$ select public.create_booking(%L, %L, %L, %L::timestamptz, 45) $$,
    :'ian', :'lee', :'lesson_type', '2026-11-03T10:00:00Z'
  ),
  'P0001', 'VALIDATION_FAILED', 'a length nobody sells is still refused'
);

select * from finish();
rollback;
