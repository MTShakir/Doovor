-- How a Business takes its money, and every new lesson knowing it (PAY-03, M3-09).
begin;
select plan(11);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select (((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London') as by_instructor_at \gset
select (((private.today() + 4)::timestamp + time '10:00') at time zone 'Europe/London') as by_learner_at \gset
select (((private.today() + 5)::timestamp + time '10:00') at time zone 'Europe/London') as later_at \gset
select (((private.today() + 6)::timestamp + time '10:00') at time zone 'Europe/London') as unconnected_at \gset

-- ---------------------------------------------------------------------------------------
-- Choosing (PAY-03).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'manager_user');
select throws_ok(
  format($$ select public.set_payment_mode(%L, 'before_lesson') $$, :'school'),
  '42501', null, 'somebody who does not own the business cannot choose how it is paid'
);
select tests.clear_authentication();

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_payment_mode(%L, 'whenever') $$, :'school'),
  'P0001', 'VALIDATION_FAILED', 'a way of paying that does not exist is refused'
);

-- Before the Business can take cards, the choice is kept but lessons are still paid in person.
select is(
  (select public.set_payment_mode(:'school', 'before_lesson')),
  'before_lesson',
  'the owner chooses to be paid the day before each lesson'
);
select tests.clear_authentication();

select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type', :'unconnected_at'::timestamptz, 60) as unconnected \gset
select tests.clear_authentication();

select is(
  (select payment_mode::text from public.bookings where id = :'unconnected'),
  'offline',
  'a Business that cannot take cards yet books lessons to be paid in person, whatever it chose'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'business.payment_mode_changed' and entity_id = :'school'),
  1,
  'and the choice is in the audit log'
);

-- ---------------------------------------------------------------------------------------
-- Lessons booked once it can take cards.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_modes');
select tests.clear_authentication();
select public.system_set_payments_state('acct_modes', true, true, true);

select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type', :'by_instructor_at'::timestamptz, 60) as by_instructor \gset
select tests.clear_authentication();

select is(
  (select status::text || ' ' || payment_mode::text || ' ' || payment_status::text
     from public.bookings where id = :'by_instructor'),
  'confirmed before_lesson unpaid',
  'a lesson the instructor books is on, to be charged the day before'
);

select tests.authenticate_as(:'lou');
select public.create_booking(:'ian', :'lou', :'lesson_type', :'by_learner_at'::timestamptz, 60) as by_learner \gset
select tests.clear_authentication();

select is(
  (select status::text || ' ' || payment_mode::text || ' ' || coalesce(hold_expires_at::text, 'no hold')
     from public.bookings where id = :'by_learner'),
  'confirmed before_lesson no hold',
  'a lesson a learner books is on at once, with nothing held, because nothing is paid yet'
);

-- ---------------------------------------------------------------------------------------
-- Changing one's mind changes the lessons booked afterwards, not the ones already booked.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.set_payment_mode(:'school', 'at_booking');
select tests.clear_authentication();

select is(
  (select payment_mode::text from public.bookings where id = :'by_instructor'),
  'before_lesson',
  'a lesson already booked keeps the terms it was booked on'
);

select tests.authenticate_as(:'lou');
select public.create_booking(:'ian', :'lou', :'lesson_type', :'later_at'::timestamptz, 60) as later \gset
select tests.clear_authentication();

select is(
  (select status::text || ' ' || payment_mode::text from public.bookings where id = :'later'),
  'pending_payment at_booking',
  'and one booked afterwards is paid for at booking, as the Business now asks'
);

select is(
  (select count(*)::int from public.audit_log
    where action = 'business.payment_mode_changed' and entity_id = :'school'),
  2,
  'every change is written down'
);

select tests.authenticate_as(:'ben');
select public.set_payment_mode(:'school', 'at_booking');
select tests.clear_authentication();

select is(
  (select count(*)::int from public.audit_log
    where action = 'business.payment_mode_changed' and entity_id = :'school'),
  2,
  'and choosing what is already chosen is not a change'
);

select * from finish();
rollback;
