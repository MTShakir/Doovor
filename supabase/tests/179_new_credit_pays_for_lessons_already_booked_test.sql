-- New credit pays for the lessons already booked, soonest first (PAY-04, D-385).
begin;
select plan(8);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set standard 'a2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha_profile', :'asha', day, '06:00', '22:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'asha', :'standard', 60, 4200);
insert into public.packages (id, business_id, name, minutes, price_pence)
values ('f0000000-0000-0000-0000-000000000179', :'asha', '90 minutes', 90, 6000);

create or replace function pg_temp.at(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/London')::date + p_days) + p_time::time) at time zone 'Europe/London';
$$;

-- Three lessons booked, with nothing paid for them, and one that has been and gone unpaid.
select tests.authenticate_as(:'asha_user');
select public.create_booking(:'asha_profile', :'lee', :'standard', pg_temp.at(5, '10:00'), 60) as later \gset
select public.create_booking(:'asha_profile', :'lee', :'standard', pg_temp.at(3, '10:00'), 60) as soonest \gset
select public.create_booking(:'asha_profile', :'lee', :'standard', pg_temp.at(4, '10:00'), 60) as next \gset
select tests.clear_authentication();
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values ('f0000000-0000-0000-0000-000000000180', :'asha', :'asha_profile', :'lee', :'standard',
        pg_temp.at(-2, '10:00'), pg_temp.at(-2, '11:00'), 0, 'completed', 4200, 'instructor');

-- An hour and a half of credit, paid for in person.
select tests.authenticate_as(:'asha_user');
select public.record_offline_package(:'lee', 'f0000000-0000-0000-0000-000000000179', 'cash');
select tests.clear_authentication();

select is(
  (select payment_status::text from public.bookings where id = :'soonest'),
  'paid_credit',
  'the soonest lesson is paid for by the credit'
);
select is((select credit_minutes from public.bookings where id = :'soonest'), 60, 'all of its hour');
select is(
  (select payment_status::text || ' ' || credit_minutes from public.bookings where id = :'next'),
  'unpaid 30',
  'the next takes the half hour left, and the rest of it is paid the usual way'
);
select is(
  (select payment_status::text || ' ' || credit_minutes from public.bookings where id = :'later'),
  'unpaid 0',
  'with nothing left, the one after is left as it was'
);
select is(
  (select payment_status::text || ' ' || credit_minutes from public.bookings where id = 'f0000000-0000-0000-0000-000000000180'),
  'unpaid 0',
  'a lesson that has happened is not paid again from credit'
);
select is(
  (select balance_minutes from public.credit_accounts where business_id = :'asha' and learner_id = :'lee'),
  0,
  'and the credit is spent'
);

-- A lesson with a card payment under way is left to it, and one part paid by credit keeps the
-- split it was told about.
insert into public.payments (business_id, learner_id, booking_id, amount_pence, method, status)
values (:'asha', :'lee', :'later', 4200, 'card', 'pending');
select tests.authenticate_as(:'asha_user');
select public.record_offline_package(:'lee', 'f0000000-0000-0000-0000-000000000179', 'cash');
select tests.clear_authentication();
select is(
  (select payment_status::text || ' ' || credit_minutes from public.bookings where id = :'later'),
  'unpaid 0',
  'a lesson being paid for by card is not paid twice'
);
select is(
  (select balance_minutes from public.credit_accounts where business_id = :'asha' and learner_id = :'lee'),
  90,
  'so the new credit waits for the next lesson booked'
);

select * from finish();
rollback;
