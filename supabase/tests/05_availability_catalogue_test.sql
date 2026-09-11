-- Availability and catalogue permissions (DIA-01, DIA-02, R-05, PAY-04, PRD 6.2).
begin;
select plan(17);

select tests.create_fixture();

-- Working hours: the instructor sets their own, no overlaps on a day.
select tests.authenticate_as('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 1, '08:00', '12:00') $$,
  'an instructor sets their own working hours'
);
select throws_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 1, '11:00', '14:00') $$,
  '23P01', null, 'working hours on the same day cannot overlap'
);
select lives_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('a1000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 1, '12:00', '18:00') $$,
  'back-to-back blocks are fine'
);
select throws_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('b1000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', 1, '08:00', '12:00') $$,
  '42501', null, 'nobody can set hours for another business''s instructor'
);

select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('b1000000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000000', 2, '08:00', '12:00') $$,
  '42501', null, 'a school instructor cannot set a colleague''s hours'
);
select lives_ok(
  $$ insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason)
     values ('b1000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', 'blocked',
             '2026-09-18 00:00+01', '2026-09-19 00:00+01', 'Car service') $$,
  'an instructor blocks time off (DIA-02)'
);

select tests.authenticate_as('b0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
     values ('b1000000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000000', 2, '08:00', '12:00') $$,
  'a school manager can set an instructor''s hours'
);

select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select is_empty($$ select id from public.working_hours $$, 'learners never read raw working hours');
select is_empty($$ select id from public.availability_exceptions $$, 'or time off');

-- Prices: set_prices permission (owners, managers, instructors only if allowed).
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 60, 4200) $$,
  '42501', null, 'a school instructor cannot set prices by default'
);

select tests.authenticate_as('b0000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 60, 4200),
            ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 90, 6200) $$,
  'a manager sets school prices (SCH-04)'
);
select throws_ok(
  $$ insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 50, 3500) $$,
  '23514', null, 'durations are multiples of 15 minutes'
);
select lives_ok(
  $$ insert into public.packages (business_id, name, minutes, price_pence)
     values ('bbbb0000-0000-0000-0000-000000000000', '10 hours', 600, 38000) $$,
  'a manager adds a package (PAY-04)'
);

select tests.clear_authentication();
update public.memberships set permissions = '{"set_prices": true}' where user_id = 'b0000000-0000-0000-0000-000000000003';
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select lives_ok(
  $$ insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 60, 4500) $$,
  'a school can let an instructor set their own price'
);

select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.lesson_prices), 3, 'a linked learner sees the school''s prices');
select is((select count(*)::int from public.packages), 1, 'and its packages');

select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select is_empty($$ select id from public.lesson_prices $$, 'an unlinked learner sees no prices through the tables');

select * from finish();
rollback;
