-- A lesson an instructor lengthens or shortens, and a travel gap they say is not needed
-- (BOK-03, BOK-07, D-187): the new length is priced like a new booking of that length, a lesson
-- already paid for in money is left alone, and ignoring the gap gives up travel time on both
-- sides without ever touching a lesson itself.
begin;
select plan(12);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set biz 'aaaa0000-0000-0000-0000-000000000000'
\set lesson_type 'a2000000-0000-0000-0000-000000000001'

-- An hour costs 42 pounds, so two hours at the hourly rate cost 84 (D-179).
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'biz', :'lesson_type', 60, 4200);

\set morning 'e0000000-0000-0000-0000-000000000011'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'morning', :'biz', :'asha', :'learner', :'lesson_type',
        date_trunc('day', now()) + interval '9 days 9 hours', date_trunc('day', now()) + interval '9 days 10 hours',
        30, 'confirmed', 4200, 'instructor');

-- ---------------------------------------------------------------------------------------
-- A length the instructor changes.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.reschedule_booking(%L, (date_trunc('day', now()) + interval '9 days 9 hours')::timestamptz, 120) $$, :'morning'),
  'an instructor turns an hour into two'
);
select is(
  (select (extract(epoch from (ends_at - starts_at)) / 60)::int from public.bookings where id = :'morning'),
  120,
  'and the lesson runs for two hours'
);
select is(
  (select price_pence from public.bookings where id = :'morning'),
  8400,
  'priced at the hourly rate for the time it takes, not left at the old price'
);

-- Back down again, and the price comes back down with it.
select lives_ok(
  format($$ select public.reschedule_booking(%L, (date_trunc('day', now()) + interval '9 days 9 hours')::timestamptz, 60) $$, :'morning'),
  'and shortens it again'
);
select is(
  (select price_pence from public.bookings where id = :'morning'),
  4200,
  'back to the price of an hour'
);

-- Money already taken is not quietly repriced. Nobody is granted an update on a booking, so the
-- money is marked as taken from outside a session, the way a payment would land.
select tests.clear_authentication();
update public.bookings set payment_status = 'paid_card' where id = :'morning';
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.reschedule_booking(%L, (date_trunc('day', now()) + interval '9 days 9 hours')::timestamptz, 120) $$, :'morning'),
  'ALREADY_PAID',
  'a lesson paid for in money keeps its length until the money is sorted out'
);
select tests.clear_authentication();
update public.bookings set payment_status = 'unpaid' where id = :'morning';
select tests.authenticate_as(:'asha_user');

-- ---------------------------------------------------------------------------------------
-- The gap after a lesson, which the instructor may say is not needed.
-- ---------------------------------------------------------------------------------------
-- The morning lesson ends at 10:00 and holds the diary until 10:30, so 10:00 is refused.
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, (date_trunc('day', now()) + interval '9 days 10 hours')::timestamptz, 60) $$,
         :'asha', :'learner', :'lesson_type'),
  '23P01',
  null,
  'a lesson inside the travel gap is refused'
);

select tests.clear_authentication();

-- A learner cannot help themselves to it: the gap is the instructor's to give up, so the same
-- slot with the same tick is still refused. Asked while the slot is still only held by the gap.
select tests.authenticate_as(:'learner');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, (date_trunc('day', now()) + interval '9 days 10 hours')::timestamptz, 60, null, true) $$,
         :'asha', :'learner', :'lesson_type'),
  '23P01',
  null,
  'a learner ticking it still meets the gap'
);
select tests.clear_authentication();

select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.create_booking(%L, %L, %L, (date_trunc('day', now()) + interval '9 days 10 hours')::timestamptz, 60, null, true) $$,
         :'asha', :'learner', :'lesson_type'),
  'and goes in once the instructor says the gap is not needed'
);
select tests.clear_authentication();

select is(
  (select buffer_minutes::int from public.bookings where id = :'morning'),
  0,
  'the lesson before gives up the travel time it was holding'
);
select is(
  (select (extract(epoch from (ends_at - starts_at)) / 60)::int from public.bookings where id = :'morning'),
  60,
  'and keeps every minute of the lesson itself'
);
-- The row for this booking, not a count of every such booking the database has ever seen.
select is(
  (select (a.after ->> 'ignored_gap')::boolean
     from public.audit_log a
     join public.bookings b on b.id = a.entity_id
    where a.action = 'booking.created'
      and b.instructor_id = :'asha'
      and b.starts_at = date_trunc('day', now()) + interval '9 days 10 hours'),
  true,
  'the audit says the gap was ignored'
);

select * from finish();
rollback;
