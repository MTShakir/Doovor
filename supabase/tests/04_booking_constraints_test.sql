-- Double-booking protection in the database (BOK-07, R-01 to R-03, D-001, D-002) and
-- booking visibility by role. Booking RPCs arrive in M2; here rows are written as postgres.
begin;
select plan(26);

select tests.create_fixture();

-- Instructor B1 teaches learner 1, 10:00 to 11:00 London, 30 minute buffer.
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values ('e0000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
        '2026-09-15 10:00+01', '2026-09-15 11:00+01', 30, 'confirmed', 4200, 'instructor');

select results_eq(
  $$ select lower(blocked_range), upper(blocked_range) from public.bookings where id = 'e0000000-0000-0000-0000-000000000001' $$,
  $$ values ('2026-09-15 10:00+01'::timestamptz, '2026-09-15 11:30+01'::timestamptz) $$,
  'the buffer is applied once, after the lesson (D-001)'
);

create or replace function pg_temp.book(p_instructor uuid, p_learner uuid, p_starts text, p_ends text, p_status text default 'confirmed')
returns void language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                               status, price_pence, source, expires_at, hold_expires_at)
  values ('bbbb0000-0000-0000-0000-000000000000', p_instructor, p_learner, 'b2000000-0000-0000-0000-000000000001',
          p_starts::timestamptz, p_ends::timestamptz, 30, p_status::public.booking_status, 4200, 'instructor',
          case when p_status = 'requested' then now() + interval '12 hours' end,
          case when p_status = 'pending_payment' then now() + interval '15 minutes' end);
$$;

-- Acceptance test 1 at database level.
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', '2026-09-15 11:15+01', '2026-09-15 12:15+01') $$,
  '23P01', null, 'acceptance-01: 11:15 is rejected, too close to the 10:00 lesson'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', '2026-09-15 11:30+01', '2026-09-15 12:30+01') $$,
  '11:30 succeeds: one buffer after the 10:00 lesson (acceptance test 1)'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', '2026-09-15 08:30+01', '2026-09-15 09:30+01') $$,
  'a lesson ending one buffer before the next is allowed'
);
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 09:00+01', '2026-09-15 09:45+01') $$,
  '23P01', null, 'a lesson whose buffer runs into the next lesson is rejected'
);

-- R-03: a learner cannot hold two overlapping lessons, even with different instructors.
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '2026-09-15 10:30+01', '2026-09-15 11:30+01') $$,
  '23P01', null, 'a learner cannot hold two overlapping lessons (R-03)'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '2026-09-15 11:00+01', '2026-09-15 12:00+01') $$,
  'learners need no buffer between lessons'
);

-- R-02: cancelled, no-show, declined and expired never block; the rest do (D-002).
update public.bookings set status = 'cancelled' where id = 'e0000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 10:00+01', '2026-09-15 10:45+01') $$,
  'a cancelled lesson frees its slot (R-02)'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:30+01', '2026-09-15 12:30+01', 'declined') $$,
  'declined requests do not block'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:30+01', '2026-09-15 12:30+01', 'expired') $$,
  'expired requests do not block'
);
select lives_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:30+01', '2026-09-15 12:30+01', 'no_show') $$,
  'no-shows do not block'
);
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:45+01', '2026-09-15 12:15+01', 'completed') $$,
  '23P01', null, 'completed lessons block their time (D-002)'
);
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:45+01', '2026-09-15 12:15+01', 'pending_payment') $$,
  '23P01', null, 'checkout holds block the slot (D-002)'
);
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', '2026-09-15 11:45+01', '2026-09-15 12:15+01', 'requested') $$,
  '23P01', null, 'pending requests block the slot (R-02)'
);

-- Ranges are always derived by the trigger.
update public.bookings set ends_at = '2026-09-15 12:45+01'
 where instructor_id = 'b1000000-0000-0000-0000-000000000001' and starts_at = '2026-09-15 11:30+01' and status = 'confirmed';
select results_eq(
  $$ select upper(blocked_range) from public.bookings
      where instructor_id = 'b1000000-0000-0000-0000-000000000001' and starts_at = '2026-09-15 11:30+01' and status = 'confirmed' $$,
  $$ values ('2026-09-15 13:15+01'::timestamptz) $$,
  'changing the end time recomputes the blocked range'
);
update public.bookings set blocked_range = '[2020-01-01,2020-01-02)'
 where instructor_id = 'b1000000-0000-0000-0000-000000000001' and starts_at = '2026-09-15 11:30+01' and status = 'confirmed';
select results_eq(
  $$ select lower(blocked_range) from public.bookings
      where instructor_id = 'b1000000-0000-0000-0000-000000000001' and starts_at = '2026-09-15 11:30+01' and status = 'confirmed' $$,
  $$ values ('2026-09-15 11:30+01'::timestamptz) $$,
  'the blocked range cannot be set by hand'
);

-- Integrity across tenants and basic sanity.
select throws_ok(
  $$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
     values ('aaaa0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
             'a2000000-0000-0000-0000-000000000001', '2026-09-16 10:00+01', '2026-09-16 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
  '23503', null, 'a booking cannot pair one business with another business''s instructor'
);
select throws_ok(
  $$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
             'a2000000-0000-0000-0000-000000000001', '2026-09-16 10:00+01', '2026-09-16 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
  '23503', null, 'a booking cannot use another business''s lesson type'
);
select throws_ok(
  $$ select pg_temp.book('b1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', '2026-09-17 11:00+01', '2026-09-17 10:00+01') $$,
  '23514', null, 'a lesson must end after it starts'
);

-- Visibility by role, on a clean set of bookings. Only the fixture's own: everybody below is
-- one of its people, and a lesson elsewhere that credit paid for can never be deleted (D-085).
delete from public.bookings where business_id in ('aaaa0000-0000-0000-0000-000000000000', 'bbbb0000-0000-0000-0000-000000000000');
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source) values
  ('f0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', '2026-09-20 09:00+01', '2026-09-20 10:00+01', 30, 'confirmed', 4000, 'instructor'),
  ('f0000000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', '2026-09-20 12:00+01', '2026-09-20 13:00+01', 30, 'confirmed', 4200, 'instructor'),
  ('f0000000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001', '2026-09-20 09:00+01', '2026-09-20 10:00+01', 30, 'confirmed', 4200, 'instructor');

select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select id::text from public.bookings order by id $$,
  $$ values ('f0000000-0000-0000-0000-000000000001'), ('f0000000-0000-0000-0000-000000000002') $$,
  'a learner sees their own lessons across businesses'
);
select tests.authenticate_as('c0000000-0000-0000-0000-000000000002');
select results_eq($$ select id::text from public.bookings $$, $$ values ('f0000000-0000-0000-0000-000000000003') $$, 'and never another learner''s');
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select results_eq($$ select id::text from public.bookings $$, $$ values ('f0000000-0000-0000-0000-000000000002') $$, 'a school instructor sees only their own lessons');
select tests.authenticate_as('b0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.bookings), 2, 'a manager sees every lesson in their school');
select throws_ok(
  $$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
     values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
             'b2000000-0000-0000-0000-000000000001', '2026-09-21 10:00+01', '2026-09-21 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
  '42501', null, 'nobody writes bookings directly; the booking RPC is the only way in'
);
select throws_ok(
  $$ update public.bookings set price_pence = 0 $$,
  '42501', null, 'nobody can change a booking''s price directly'
);
select tests.authenticate_as('a0000000-0000-0000-0000-000000000001');
select is_empty(
  $$ select id from public.bookings where id = 'f0000000-0000-0000-0000-000000000003' $$,
  'Business A cannot read Business B''s lesson by id'
);

select * from finish();
rollback;
