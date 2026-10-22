-- Somebody who books themselves is on the books from their first lesson that goes ahead (LRN-05, D-315, D-368).
begin;
select plan(7);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set nia 'e1720000-0000-0000-0000-000000000001'
\set ray 'e1720000-0000-0000-0000-000000000002'

-- A Business that takes cards, so a lesson booked on the link is held while it is paid for.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_d368');
select tests.clear_authentication();
select public.system_set_payments_state('acct_d368', true, true, true);
update public.businesses set plan = 'school' where id = :'school';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select tests.create_user_with_id(:'nia', 'nia.d368@test.local', 'Nia New');
select tests.create_user_with_id(:'ray', 'ray.d368@test.local', 'Ray Request');
insert into public.learner_profiles (user_id, transmission) values (:'nia', 'manual'), (:'ray', 'manual');

select (((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London') as slot_a \gset
select (((private.today() + 4)::timestamp + time '10:00') at time zone 'Europe/London') as slot_b \gset

-- ---------------------------------------------------------------------------------------
-- A time held while they pay.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'nia');
select public.create_booking(:'ian', :'nia', :'lesson_type', :'slot_a'::timestamptz, 60) as held \gset
select tests.clear_authentication();

select is(
  (select status::text from public.bookings where id = :'held'),
  'pending_payment',
  'the lesson is held while it is paid for'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'nia'),
  'enquiry',
  'and somebody new is an enquiry until it goes ahead'
);

update public.bookings set status = 'confirmed', payment_status = 'paid_card' where id = :'held';
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'nia'),
  'active',
  'paid for and confirmed, they are on the books'
);

-- ---------------------------------------------------------------------------------------
-- A time asked for, which runs out.
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles set instant_book = false where id = :'ian';
select tests.authenticate_as(:'ray');
select public.create_booking(:'ian', :'ray', :'lesson_type', :'slot_b'::timestamptz, 60) as asked \gset
select tests.clear_authentication();

select is(
  (select status::text from public.bookings where id = :'asked'),
  'requested',
  'a time asked for waits for the instructor'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'ray'),
  'enquiry',
  'and its learner is an enquiry meanwhile'
);
update public.bookings set status = 'expired' where id = :'asked';
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'ray'),
  'enquiry',
  'run out unanswered, they stay an enquiry rather than on the books for good'
);

-- Somebody already on the books is left as they are.
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'lee'),
  'active',
  'somebody already active stays active'
);

select * from finish();
rollback;
