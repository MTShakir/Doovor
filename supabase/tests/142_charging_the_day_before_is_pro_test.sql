-- Charging the saved card the day before is Pro (PAY-03, PRD 9.18, D-302).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set lesson_type 'a2000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- Asha takes cards, on Free, and teaches every day.
update public.businesses
   set plan = 'free', stripe_account_id = 'acct_day_before', stripe_charges_enabled = true
 where id = :'asha_business';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha', :'asha_business', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'asha_business', :'lesson_type', 60, 4000);

select (((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London') as on_pro_at \gset
select (((private.today() + 4)::timestamp + time '10:00') at time zone 'Europe/London') as back_on_free_at \gset
select (((private.today() + 5)::timestamp + time '10:00') at time zone 'Europe/London') as by_learner_at \gset
select (((private.today() + 6)::timestamp + time '10:00') at time zone 'Europe/London') as pro_again_at \gset

-- ---------------------------------------------------------------------------------------
-- On Free it cannot be chosen; everything else can.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.set_payment_mode(%L, 'before_lesson') $$, :'asha_business'),
  'P0001', 'PLAN_REQUIRED',
  'an owner on Free cannot choose to charge the day before'
);
select is(
  (select public.set_payment_mode(:'asha_business', 'after_lesson')),
  'after_lesson',
  'and can still choose to be paid after the lesson'
);
select is(
  (select public.set_payment_mode(:'asha_business', 'at_booking')),
  'at_booking',
  'or at booking'
);

-- ---------------------------------------------------------------------------------------
-- On Pro it can, and a lesson is booked to be charged the day before.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
update public.businesses set plan = 'pro' where id = :'asha_business';
select tests.authenticate_as(:'asha_user');
select is(
  (select public.set_payment_mode(:'asha_business', 'before_lesson')),
  'before_lesson',
  'an owner on Pro chooses to charge the day before'
);
select public.create_booking(:'asha', :'lee', :'lesson_type', :'on_pro_at'::timestamptz, 60) as on_pro \gset
select tests.clear_authentication();
select is(
  (select payment_mode::text from public.bookings where id = :'on_pro'),
  'before_lesson',
  'and a lesson booked on Pro is charged the day before'
);

-- ---------------------------------------------------------------------------------------
-- Back on Free: the choice is kept, new lessons are paid at booking, and the lesson already
-- booked keeps the terms it was booked on (PAY-03).
-- ---------------------------------------------------------------------------------------
update public.businesses set plan = 'free' where id = :'asha_business';
select is(
  (select settings ->> 'payment_mode' from public.businesses where id = :'asha_business'),
  'before_lesson',
  'a Business back on Free keeps what it chose'
);
select is(private.payment_mode(:'asha_business'), 'at_booking', 'but is paid at booking while it is on Free');

select tests.authenticate_as(:'asha_user');
select public.create_booking(:'asha', :'lee', :'lesson_type', :'back_on_free_at'::timestamptz, 60) as back_on_free \gset
select tests.clear_authentication();
select isnt(
  (select payment_mode::text from public.bookings where id = :'back_on_free'),
  'before_lesson',
  'so a lesson the instructor books now is not charged the day before'
);

select tests.authenticate_as(:'lee');
select public.create_booking(:'asha', :'lee', :'lesson_type', :'by_learner_at'::timestamptz, 60) as by_learner \gset
select tests.clear_authentication();
select is(
  (select status::text || ' ' || payment_mode::text from public.bookings where id = :'by_learner'),
  'pending_payment at_booking',
  'and one a learner books is held while they pay, as at any Business paid at booking'
);

select is(
  (select payment_mode::text from public.bookings where id = :'on_pro'),
  'before_lesson',
  'the lesson booked on Pro keeps its terms'
);
select ok(
  exists (select 1 from jsonb_array_elements(public.system_lessons_to_charge(24 * 30)) as one
           where one ->> 'booking_id' = :'on_pro'),
  'and is still charged the day before'
);

-- ---------------------------------------------------------------------------------------
-- On Pro again, nothing has to be chosen twice.
-- ---------------------------------------------------------------------------------------
update public.businesses set plan = 'pro' where id = :'asha_business';
select tests.authenticate_as(:'asha_user');
select public.create_booking(:'asha', :'lee', :'lesson_type', :'pro_again_at'::timestamptz, 60) as pro_again \gset
select tests.clear_authentication();
select is(
  (select payment_mode::text from public.bookings where id = :'pro_again'),
  'before_lesson',
  'back on Pro, lessons are charged the day before again'
);

select * from finish();
rollback;
