-- Who stands out on the platform, over a range of days (ADM-01, D-172).
--
-- Held in March 2021, long before anything else in the fixture, so the only rows in the range are
-- the ones made here.
begin;
select plan(13);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set asha_type 'a2000000-0000-0000-0000-000000000001'
\set school_type 'b2000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000010'
\set from_at '2021-03-01T00:00:00Z'
\set to_at '2021-04-01T00:00:00Z'

-- Money taken: the school £420 in two payments, Asha £150 in one, and £99 the month before.
insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, fee_pence, method, status, paid_at) values
  (:'school', :'lee', null, 'offline', 30000, 0, 'cash', 'paid', '2021-03-05T11:00:00Z'),
  (:'school', :'lou', null, 'offline', 12000, 0, 'bank', 'paid', '2021-03-09T11:00:00Z'),
  (:'asha_biz', :'lee', null, 'offline', 15000, 0, 'cash', 'paid', '2021-03-07T11:00:00Z'),
  (:'asha_biz', :'lee', null, 'offline', 9900, 0, 'cash', 'paid', '2021-02-07T11:00:00Z');

-- Lessons: the school teaches two learners (Lou twice), Asha one, one called off counts for nobody,
-- and one after the range counts for nobody.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source) values
  (:'school', :'ian', :'lee', :'school_type', '2021-03-05T10:00:00Z', '2021-03-05T11:00:00Z', 0, 'completed', 'paid_cash', 4200, 'instructor'),
  (:'school', :'ivy', :'lou', :'school_type', '2021-03-06T10:00:00Z', '2021-03-06T11:00:00Z', 0, 'completed', 'paid_bank', 4200, 'instructor'),
  (:'school', :'ivy', :'lou', :'school_type', '2021-03-07T10:00:00Z', '2021-03-07T11:00:00Z', 0, 'confirmed', 'unpaid', 4200, 'instructor'),
  (:'school', :'ian', :'liz', :'school_type', '2021-03-08T10:00:00Z', '2021-03-08T11:00:00Z', 0, 'cancelled', 'unpaid', 4200, 'instructor'),
  (:'asha_biz', :'asha', :'lee', :'asha_type', '2021-03-10T10:00:00Z', '2021-03-10T11:00:00Z', 0, 'completed', 'paid_cash', 5000, 'instructor'),
  (:'asha_biz', :'asha', :'liz', :'asha_type', '2021-04-10T10:00:00Z', '2021-04-10T11:00:00Z', 0, 'confirmed', 'unpaid', 5000, 'instructor');

-- Three Businesses joined in the range, on days of their own.
insert into public.businesses (type, name, slug, created_at) values
  ('school', 'New School One', 'new-school-one', '2021-03-02T09:00:00Z'),
  ('independent', 'New Instructor Two', 'new-instructor-two', '2021-03-20T09:00:00Z'),
  ('independent', 'New Instructor Three', 'new-instructor-three', '2021-03-25T09:00:00Z');

select private.platform_highlights_facts(:'from_at', :'to_at', 2) as facts \gset

-- ---------------------------------------------------------------------------------------
-- What each list holds.
-- ---------------------------------------------------------------------------------------
select is(
  (select (f #>> '{earning_schools,0,name}') from (select (:'facts')::jsonb as f) x),
  'Bee School',
  'the school that took the most is first among schools'
);
select is(
  (select (f #>> '{earning_schools,0,pence}')::bigint from (select (:'facts')::jsonb as f) x),
  42000::bigint,
  'with what it took in those days, and nothing from the month before'
);
select is(
  (select (f #>> '{earning_instructors,0,name}') from (select (:'facts')::jsonb as f) x),
  'Asha Driving',
  'and an instructor of one is ranked among instructors, not schools'
);
select is(
  (select jsonb_array_length(f -> 'earning_instructors') from (select (:'facts')::jsonb as f) x),
  1,
  'a Business that took nothing is in neither list'
);
select is(
  (select (f #>> '{busiest_schools,0,learners}')::int from (select (:'facts')::jsonb as f) x),
  2,
  'the busiest school counts each learner once, however many lessons they had'
);
select is(
  (select (f #>> '{busiest_instructors,0,learners}')::int from (select (:'facts')::jsonb as f) x),
  1,
  'and a lesson after the range belongs to another range'
);

-- ---------------------------------------------------------------------------------------
-- Who joined, newest first, a few at a time.
-- ---------------------------------------------------------------------------------------
select is(
  (select (f #>> '{joined,0,name}') from (select (:'facts')::jsonb as f) x),
  'New Instructor Three',
  'the newest arrival is first'
);
select is(
  (select jsonb_array_length(f -> 'joined') from (select (:'facts')::jsonb as f) x),
  2,
  'no more arrivals are sent than were asked for'
);
select is(
  (select (f ->> 'more')::boolean from (select (:'facts')::jsonb as f) x),
  true,
  'and the screen is told there are more'
);
select is(
  (select (f ->> 'more')::boolean from (select private.platform_highlights_facts(:'from_at', :'to_at', 10) as f) x),
  false,
  'until it asks for enough of them'
);

-- ---------------------------------------------------------------------------------------
-- Who may read it.
-- ---------------------------------------------------------------------------------------
select tests.create_user_with_id(:'staff', 'support@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(
  format($$ select public.platform_highlights(%L, %L, 5) $$, :'from_at', :'to_at'),
  'platform staff past their second step read the lists'
);
select throws_ok(
  format($$ select public.platform_highlights(%L, %L, 0) $$, :'from_at', :'to_at'),
  'P0001', 'VALIDATION_FAILED', 'asking for none of the arrivals is not a question'
);

select tests.authenticate_as(:'ben', 'aal2');
select throws_ok(
  format($$ select public.platform_highlights(%L, %L, 5) $$, :'from_at', :'to_at'),
  '42501', 'NOT_ALLOWED', 'the owner of a school does not read the platform lists'
);

select * from finish();
rollback;
