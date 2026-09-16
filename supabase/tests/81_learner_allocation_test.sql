-- Learner allocation: the facts behind suggesting an instructor (SCH-03, LRN-06, M5-14).
begin;
select plan(16);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set ada_user 'e0000000-0000-0000-0000-000000000006'
\set old_user 'e0000000-0000-0000-0000-000000000007'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Noon on Wednesday 28 October 2026: the next 14 days run to noon on Wednesday 11 November.
\set now '2026-10-28T12:00:00Z'

-- Places: the learner in Fallowfield, Ian based in the city centre, Ivy in Leeds.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district) values
  ('M14 6HR', 'M14', 'M', 53.4452, -2.2193, 'Manchester'),
  ('M1 1AE', 'M1', 'M', 53.4794, -2.2453, 'Manchester'),
  ('LS1 4DY', 'LS1', 'LS', 53.7986, -1.5492, 'Leeds')
on conflict (postcode) do nothing;

update public.learner_profiles
   set postcode = 'M14 6HR', location = (select location from public.postcodes where postcode = 'M14 6HR'), transmission = 'automatic'
 where user_id = :'lee';
update public.instructor_profiles
   set transmission = 'both', radius_miles = 8, base_postcode = 'M1 1AE', base_location = (select location from public.postcodes where postcode = 'M1 1AE'),
       verification_status = 'approved', verified_at = now(), badge_expiry = '2027-06-30'
 where id = :'ian';
update public.instructor_profiles
   set transmission = 'manual', base_postcode = 'LS1 4DY', base_location = (select location from public.postcodes where postcode = 'LS1 4DY')
 where id = :'ivy';

-- Ada teaches automatic and has no base yet; somebody switched off is not suggested at all.
select tests.create_user_with_id(:'ada_user', 'ada@test.local', 'Ada Auto');
select tests.create_user_with_id(:'old_user', 'old@test.local', 'Old Hand');
insert into public.memberships (business_id, user_id, role, status) values
  (:'school', :'ada_user', 'instructor', 'active'),
  (:'school', :'old_user', 'instructor', 'deactivated');
insert into public.instructor_profiles (user_id, business_id, display_name, transmission, verification_status, verified_at, badge_expiry) values
  (:'ada_user', :'school', 'Ada', 'automatic', 'approved', now(), '2026-10-01'),
  (:'old_user', :'school', 'Old Hand', 'automatic', 'approved', now(), null);
select id as ada from public.instructor_profiles where user_id = :'ada_user' \gset
select id as old from public.instructor_profiles where user_id = :'old_user' \gset

-- Ian works Monday to Friday, nine to five, and takes Tuesday 10 November off. In the 14 days
-- from noon today that is 5 hours today, 16 on Thursday and Friday, 40 next week, 8 on the Monday
-- after, and 3 on the last morning: 72 hours, or 4320 minutes.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', day, '09:00', '17:00' from generate_series(1, 5) as day;
insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason)
values (:'ian', :'school', 'blocked', '2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z', 'Day off');
-- Ada opens three hours on Saturday.
insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason)
values (:'ada', :'school', 'open', '2026-10-31T09:00:00Z', '2026-10-31T12:00:00Z', 'Extra Saturday');

-- Ian's time taken: an hour's lesson with its 30 minute buffer, and a request still waiting.
-- Not taken: a lesson called off, and a request that lapsed.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source, expires_at) values
  (:'school', :'ian', :'lee', :'lesson_type', '2026-10-29T10:00:00Z', '2026-10-29T11:00:00Z', 30, 'confirmed', 'unpaid', 4200, 'instructor', null),
  (:'school', :'ian', :'lou', :'lesson_type', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z', 0, 'requested', 'unpaid', 4200, 'self', '2026-10-29T10:00:00Z'),
  (:'school', :'ian', :'lee', :'lesson_type', '2026-11-03T10:00:00Z', '2026-11-03T11:00:00Z', 0, 'cancelled', 'unpaid', 4200, 'instructor', null),
  (:'school', :'ian', :'lee', :'lesson_type', '2026-11-04T10:00:00Z', '2026-11-04T11:00:00Z', 0, 'requested', 'unpaid', 4200, 'self', '2026-10-28T11:00:00Z');

-- ---------------------------------------------------------------------------------------
-- The facts for Lee, who wants an automatic and lives in M14.
-- ---------------------------------------------------------------------------------------
select private.learner_allocation_facts(:'school', :'lee', :'now') as facts \gset

select results_eq(
  format($$ select f -> 'learner' ->> 'transmission', f -> 'learner' ->> 'outcode' from (select %L::jsonb as f) as x $$, :'facts'),
  $$ values ('automatic'::text, 'M14'::text) $$,
  'the learner wants an automatic, in M14 (SCH-03)'
);
select results_eq(
  format($$ select i ->> 'name' from jsonb_array_elements((select %L::jsonb) -> 'instructors') as i $$, :'facts'),
  $$ values ('Ada'::text), ('Ian'::text), ('Ivy'::text) $$,
  'everybody still teaching at the school is weighed up, and nobody switched off'
);
select results_eq(
  format($$ select i ->> 'name', i ->> 'badge' from jsonb_array_elements((select %L::jsonb) -> 'instructors') as i $$, :'facts'),
  $$ values ('Ada'::text, 'expired'::text), ('Ian'::text, 'checked'::text), ('Ivy'::text, 'unchecked'::text) $$,
  'with whether each badge is checked and in date: Ada''s ran out on 1 October, and Ivy''s was never checked'
);
select results_eq(
  format($$ select i ->> 'transmission', (i ->> 'radius_miles')::int, (i ->> 'open_minutes')::int, (i ->> 'free_minutes')::int
              from jsonb_array_elements((select %L::jsonb) -> 'instructors') as i where i ->> 'name' = 'Ian' $$, :'facts'),
  $$ values ('both'::text, 8, 4320, 4170) $$,
  'Ian has 72 hours open in the next two weeks, his day off taken out, and 150 minutes of it taken by a lesson with its buffer and a waiting request'
);
select ok(
  (select (i ->> 'distance_miles')::numeric between 2.2 and 2.6
     from jsonb_array_elements((:'facts')::jsonb -> 'instructors') as i where i ->> 'name' = 'Ian'),
  'and is based about two and a half miles from the learner'
);
select results_eq(
  format($$ select i ->> 'transmission', (i ->> 'open_minutes')::int, (i ->> 'free_minutes')::int, (i ->> 'distance_miles')::numeric between 30 and 45
              from jsonb_array_elements((select %L::jsonb) -> 'instructors') as i where i ->> 'name' = 'Ivy' $$, :'facts'),
  $$ values ('manual'::text, 0, 0, true) $$,
  'Ivy teaches manual in Leeds and has no hours set'
);
select results_eq(
  format($$ select (i ->> 'open_minutes')::int, (i ->> 'free_minutes')::int, i -> 'distance_miles' = 'null'::jsonb
              from jsonb_array_elements((select %L::jsonb) -> 'instructors') as i where i ->> 'name' = 'Ada' $$, :'facts'),
  $$ values (180, 180, true) $$,
  'Ada has her extra Saturday free, and no distance without a base'
);

-- A learner with no postcode on their profile is placed by their home pickup.
insert into public.pickup_points (learner_id, kind, label, address, postcode, location, is_default)
values (:'lou', 'home', 'Home', '1 Piccadilly', 'M1 1AE', (select location from public.postcodes where postcode = 'M1 1AE'), true);
select results_eq(
  format($$ select f -> 'learner' ->> 'outcode', (i ->> 'distance_miles')::numeric < 0.1
              from (select private.learner_allocation_facts(%L, %L, %L) as f) as x
              cross join jsonb_array_elements(x.f -> 'instructors') as i
             where i ->> 'name' = 'Ian' $$, :'school', :'lou', :'now'),
  $$ values ('M1'::text, true) $$,
  'a learner without a postcode on their profile is placed by their home pickup'
);

-- ---------------------------------------------------------------------------------------
-- Who may ask.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select lives_ok(format($$ select public.learner_allocation(%L, %L) $$, :'school', :'lee'), 'a manager sees the facts for a learner at the school');
select tests.authenticate_as(:'ben');
select throws_ok(format($$ select public.learner_allocation(%L, %L) $$, :'school', :'liz'), '42501', null, 'but not for a learner the school does not have');
select throws_ok(format($$ select public.learner_allocation(%L, %L) $$, :'asha_biz', :'lee'), '42501', null, 'and a Business of one has nobody to allocate');
select tests.authenticate_as(:'ian_user');
select throws_ok(format($$ select public.learner_allocation(%L, %L) $$, :'school', :'lee'), '42501', null, 'an instructor does not allocate learners');
select tests.authenticate_as(:'outsider');
select throws_ok(format($$ select public.learner_allocation(%L, %L) $$, :'school', :'lee'), '42501', null, 'nor does anybody from outside');
select throws_ok(
  format($$ select private.learner_allocation_facts(%L, %L, now()) $$, :'school', :'lee'),
  '42501', null, 'and the facts themselves are not open to anybody signed in'
);

-- ---------------------------------------------------------------------------------------
-- Giving the learner to somebody.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.assign_learner(%L, %L) $$, :'lee', :'old'),
  'P0001', 'INSTRUCTOR_INACTIVE', 'nobody is given to an instructor who has been switched off (D-120)'
);
select lives_ok(format($$ select public.assign_learner(%L, %L) $$, :'lee', :'ada'), 'the owner gives Lee to Ada');

select * from finish();
rollback;
