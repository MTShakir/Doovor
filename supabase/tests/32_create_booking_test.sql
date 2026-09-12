-- Making a booking through the one function that makes them (BOK-01, R-10, M2-14).
--
-- Acceptance test 1 from PRD 17.2, at database level: an instructor with a 30 minute buffer
-- and a ten o clock lesson may not take one at 11:15, and may take one at 11:30.
begin;
select plan(17);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set asha_type 'a2000000-0000-0000-0000-000000000001'

-- Tuesday 15 September 2026, nine to five, and prices for the durations on offer.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ian', :'school', 2, '09:00', '18:00'),
       (:'asha', 'aaaa0000-0000-0000-0000-000000000000', 2, '09:00', '18:00');
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200),
       (:'school', :'lesson_type', 90, 6200),
       ('aaaa0000-0000-0000-0000-000000000000', :'asha_type', 60, 4000);
update public.instructor_profiles set buffer_minutes = 30 where id in (:'ian', :'asha');

-- ---------------------------------------------------------------------------------------
-- Acceptance test 1 (PRD 17.2).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type', '2026-09-15 10:00+01'::timestamptz, 60) as first_lesson \gset

select is(
  (select status::text from public.bookings where id = :'first_lesson'),
  'confirmed',
  'an instructor booking for their own learner is confirmed at once'
);
select is(
  (select price_pence from public.bookings where id = :'first_lesson'),
  4200,
  'and the price comes from the catalogue, not from the caller'
);
select is(
  (select upper(blocked_range)::text from public.bookings where id = :'first_lesson'),
  (select (timestamptz '2026-09-15 11:30+01')::text),
  'the slot is held until half an hour after the lesson ends (R-01)'
);

select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 11:15+01'::timestamptz, 60) $$,
  '23P01', 'SLOT_TAKEN', 'acceptance-01: 11:15 is too close to the ten o clock lesson'
);
select lives_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 11:30+01'::timestamptz, 60) $$,
  'acceptance-01: 11:30 is far enough away'
);

-- ---------------------------------------------------------------------------------------
-- Who may book what.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 14:00+01'::timestamptz, 60) $$,
  '42501', null, 'an instructor cannot book for somebody who is not their learner'
);
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 14:00+01'::timestamptz, 45) $$,
  'P0001', 'VALIDATION_FAILED', 'and cannot invent a duration that has no price'
);

select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 14:00+01'::timestamptz, 60) $$,
  '42501', null, 'an instructor from another Business cannot book in this diary'
);

-- ---------------------------------------------------------------------------------------
-- A learner booking for themselves (BOK-02, R-04).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'liz');
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 14:00+01'::timestamptz, 60) $$,
  '42501', null, 'a learner cannot book on somebody else behalf'
);
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
       'b2000000-0000-0000-0000-000000000001', (now() + interval '2 hours')::timestamptz, 60) $$,
  'P0001', 'NOTICE_TOO_SHORT', 'and is held to the notice the Business asks for'
);
select throws_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 20:00+01'::timestamptz, 60) $$,
  'P0001', 'OUTSIDE_AVAILABILITY', 'and to the hours the instructor is open'
);

-- Liz belongs to nobody, so booking is also how she joins (BOK-02).
select public.create_booking(:'ian', :'liz', :'lesson_type', '2026-09-15 15:00+01'::timestamptz, 60) as liz_lesson \gset
select is(
  (select source::text from public.learner_relationships where learner_id = :'liz' and business_id = :'school'),
  'marketplace',
  'a learner booking for the first time joins the Business as they do it'
);
select is(
  (select source::text from public.bookings where id = :'liz_lesson'),
  'self',
  'and the booking says they made it themselves'
);

-- ---------------------------------------------------------------------------------------
-- A request that nobody answered stops holding the slot (R-12).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
update public.instructor_profiles set instant_book = false where id = :'ivy';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ivy', :'school', 2, '09:00', '18:00');

select tests.authenticate_as(:'lou');
select public.create_booking(:'ivy', :'lou', :'lesson_type', '2026-09-15 09:00+01'::timestamptz, 60) as request \gset
select is(
  (select status::text from public.bookings where id = :'request'),
  'requested',
  'an instructor who answers their requests gets one to answer'
);
select ok(
  (select expires_at from public.bookings where id = :'request') <= timestamptz '2026-09-15 07:00+01',
  'and it lapses at the latest two hours before the lesson (R-12)'
);

select tests.clear_authentication();
update public.bookings set expires_at = now() - interval '1 minute' where id = :'request';

select tests.authenticate_as(:'lou');
select lives_ok(
  $$ select public.create_booking('b1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
       'b2000000-0000-0000-0000-000000000001', '2026-09-15 09:00+01'::timestamptz, 60) $$,
  'a lapsed request no longer holds the slot'
);
select is(
  (select status::text from public.bookings where id = :'request'),
  'expired',
  'and is marked as lapsed rather than left to look live'
);

select * from finish();
rollback;
